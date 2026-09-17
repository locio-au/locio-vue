import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AddressAutocomplete from "./AddressAutocomplete.vue";

const ADDRESS = {
  address_detail_pid: "GAVIC425624910",
  formatted: "Unit 104, 119 Turner Street, Abbotsford VIC 3067",
  lat: -37.79928725,
  lng: 145.0004257,
  components: { postcode: "3067" },
};

function stubFetch(body: unknown = { data: [ADDRESS] }) {
  const urls: string[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    urls.push(String(url));
    signals.push(init?.signal ?? undefined);
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
      setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), 5);
    });
  });
  return { urls, signals };
}

function widget(props: Record<string, unknown> = {}) {
  return mount(AddressAutocomplete, {
    props: { publicKey: "lc_pub_x", label: "Address", ...props },
    attachTo: document.body,
  });
}

/** Let the debounce fire and the promise settle. */
async function settle(ms = 500) {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** A keystroke is not a request. Every character firing a call spends a unit
 *  per keypress and queues the useful one behind dead ones. */
it("makes one request for a burst of typing", async () => {
  const { urls } = stubFetch();
  const w = widget();

  const input = w.get("input");
  for (const term of ["119", "119 t", "119 tu", "119 turner"]) {
    await input.setValue(term);
  }
  await settle();

  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain("q=119+turner");
});

/** Superseded requests are cancelled, not merely ignored: ignoring frees
 *  nothing and the socket stays taken. */
it("aborts a request a later keystroke supersedes", async () => {
  const { signals } = stubFetch();
  const w = widget();
  const input = w.get("input");

  await input.setValue("119 tur");
  await settle();
  expect(signals).toHaveLength(1);

  await input.setValue("119 turner");
  await settle();
  expect(signals).toHaveLength(2);

  expect(signals[0]!.aborted).toBe(true);
  expect(signals[1]!.aborted).toBe(false);
});

it("does not call the API below the minimum length", async () => {
  const { urls } = stubFetch();
  const w = widget();

  await w.get("input").setValue("11");
  await settle();

  expect(urls).toHaveLength(0);
});

it("emits the picked address", async () => {
  stubFetch();
  const w = widget();

  await w.get("input").setValue("119 turner");
  await settle();
  await w.get('[role="option"]').trigger("click");

  const emitted = w.emitted("select");
  expect(emitted).toBeTruthy();
  expect((emitted![0]![0] as { address_detail_pid: string }).address_detail_pid).toBe(
    "GAVIC425624910",
  );
});

/** An autocomplete that only works with a mouse is one half the people
 *  filling your form cannot use. */
it("is a keyboard operable combobox", async () => {
  stubFetch();
  const w = widget();
  const input = w.get("input");

  expect(input.attributes("role")).toBe("combobox");
  expect(input.attributes("aria-expanded")).toBe("false");

  await input.setValue("119 turner");
  await settle();
  expect(input.attributes("aria-expanded")).toBe("true");

  await input.trigger("keydown", { key: "ArrowDown" });
  const option = w.get('[role="option"]');
  expect(option.attributes("aria-selected")).toBe("true");
  expect(input.attributes("aria-activedescendant")).toBe(option.attributes("id"));

  await input.trigger("keydown", { key: "Enter" });
  expect(w.emitted("select")).toBeTruthy();
});

it("closes on Escape without selecting", async () => {
  stubFetch();
  const w = widget();
  const input = w.get("input");

  await input.setValue("119 turner");
  await settle();
  expect(w.find('[role="listbox"]').isVisible()).toBe(true);

  await input.trigger("keydown", { key: "Escape" });
  expect(input.attributes("aria-expanded")).toBe("false");
  expect(w.emitted("select")).toBeFalsy();
});

/** An outage and an address that does not exist are different answers. A
 *  widget that renders nothing for both tells the user neither. */
it("says when nothing matched", async () => {
  stubFetch({ data: [] });
  const w = widget();

  await w.get("input").setValue("119 nowhere");
  await settle();

  expect(w.get('[role="status"]').text()).toMatch(/no addresses/i);
});

it("says when the lookup is unavailable", async () => {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
  const w = widget();

  await w.get("input").setValue("119 turner");
  await settle();

  expect(w.get('[role="status"]').text()).toMatch(/unavailable/i);
});

it("supports v-model on the typed term", async () => {
  stubFetch();
  const w = widget({ modelValue: "" });

  await w.get("input").setValue("119 turner");

  expect(w.emitted("update:modelValue")).toBeTruthy();
});
