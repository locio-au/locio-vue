<script setup lang="ts">
/**
 * An accessible address autocomplete, ready to drop in.
 *
 * Implements the ARIA combobox pattern: arrow keys move through the list,
 * Enter picks, Escape closes, and the active option is announced. An
 * autocomplete that only works with a mouse is one that half the people
 * filling your form cannot use.
 *
 * Styling is minimal and entirely optional. Pass `classNames` to use your own,
 * or `styled={false}` for bare markup: a component that brings a stylesheet is
 * a component that fights whatever you already have.
 */
import { computed, ref, useId, watch } from "vue";
import { useAddressAutocomplete } from "./useAddressAutocomplete";
import type { Address } from "./types";

const props = withDefaults(
  defineProps<{
    /** A public key (lc_pub_...). Never a secret key: this runs in a browser. */
    publicKey: string;
    label?: string;
    placeholder?: string;
    debounceMs?: number;
    minLength?: number;
    limit?: number;
    baseUrl?: string;
    styled?: boolean;
    classNames?: Partial<
      Record<"root" | "label" | "input" | "list" | "option" | "status", string>
    >;
    name?: string;
    required?: boolean;
    modelValue?: string;
  }>(),
  {
    label: "Address",
    placeholder: "Start typing an address",
    styled: true,
    classNames: () => ({}),
  },
);

const emit = defineEmits<{
  select: [address: Address];
  "update:modelValue": [term: string];
}>();

const { term, results, status, note, clear } = useAddressAutocomplete({
  publicKey: props.publicKey,
  baseUrl: props.baseUrl,
  debounceMs: props.debounceMs,
  minLength: props.minLength,
  limit: props.limit,
});

const uid = useId();
const inputId = computed(() => `locio-${uid}`);
const listId = computed(() => `${inputId.value}-list`);

const active = ref(-1);
const open = ref(false);

const showList = computed(
  () => open.value && status.value === "results" && results.value.length > 0,
);

const MESSAGES: Record<string, string> = {
  idle: "",
  searching: "Searching…",
  results: "",
  empty: "No addresses match that yet. Keep typing, or check the street number.",
  unavailable: "Address lookup is unavailable right now. Please try again shortly.",
};
// The service's own sentence wins over ours. Ours is written for somebody who
// has not typed enough of an Australian address yet; the service's says things
// ours cannot know, such as that we hold no addresses at all for the country
// this visitor is in.
const message = computed(() =>
  status.value === "empty" && note.value ? note.value : (MESSAGES[status.value] ?? ""),
);

if (props.modelValue !== undefined) term.value = props.modelValue;
watch(term, (next) => emit("update:modelValue", next));

function onInput(event: Event) {
  term.value = (event.target as HTMLInputElement).value;
  open.value = true;
  active.value = -1;
}

function choose(address: Address) {
  term.value = address.formatted;
  clear();
  open.value = false;
  active.value = -1;
  emit("select", address);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    open.value = false;
    active.value = -1;
    return;
  }
  if (!showList.value) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    active.value = (active.value + 1) % results.value.length;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    active.value = active.value <= 0 ? results.value.length - 1 : active.value - 1;
  } else if (event.key === "Enter" && active.value >= 0) {
    event.preventDefault();
    choose(results.value[active.value]!);
  }
}

let blurTimer: ReturnType<typeof setTimeout> | undefined;
function onBlur() {
  // Deferred, because a click on an option fires blur first and would
  // otherwise unmount the option before its own click handler ran.
  blurTimer = setTimeout(() => (open.value = false), 120);
}
function keepOpen(event: MouseEvent) {
  event.preventDefault();
  clearTimeout(blurTimer);
}
</script>

<template>
  <div :class="classNames.root" :style="styled ? S.root : undefined">
    <label :for="inputId" :class="classNames.label" :style="styled ? S.label : undefined">
      {{ label }}
    </label>

    <input
      :id="inputId"
      :name="name"
      :required="required"
      :class="classNames.input"
      :style="styled ? S.input : undefined"
      type="text"
      autocomplete="off"
      role="combobox"
      :aria-expanded="showList"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="showList && active >= 0 ? `${listId}-${active}` : undefined"
      :placeholder="placeholder"
      :value="term"
      @input="onInput"
      @keydown="onKeydown"
      @focus="open = true"
      @blur="onBlur"
    />

    <p
      v-if="message"
      role="status"
      :class="classNames.status"
      :style="styled ? S.status : undefined"
    >
      {{ message }}
    </p>

    <ul
      :id="listId"
      role="listbox"
      :aria-label="`${label} suggestions`"
      :class="classNames.list"
      :style="styled ? S.list : undefined"
      v-show="showList"
    >
      <li
        v-for="(address, i) in results"
        :key="address.address_detail_pid ?? address.gnaf_pid ?? i"
        :id="`${listId}-${i}`"
        role="option"
        :aria-selected="i === active"
        :class="classNames.option"
        :style="styled ? { ...S.option, ...(i === active ? S.optionActive : {}) } : undefined"
        @mouseenter="active = i"
        @mousedown="keepOpen"
        @click="choose(address)"
      >
        {{ address.formatted }}
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import type { CSSProperties } from "vue";

/** A restrained default: enough to be usable out of the box, little enough to
 *  be overridden by one class name. */
const S: Record<string, CSSProperties> = {
  root: { position: "relative", display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontSize: "14px", fontWeight: 500 },
  input: {
    font: "inherit",
    fontSize: "16px", // 16px or iOS zooms the page on focus.
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    width: "100%",
    boxSizing: "border-box",
  },
  status: { margin: 0, fontSize: "12px", color: "#71717a" },
  list: {
    listStyle: "none",
    margin: "4px 0 0",
    padding: 0,
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    background: "#fff",
    maxHeight: "280px",
    overflowY: "auto",
  },
  option: { padding: "10px 12px", cursor: "pointer", fontSize: "14px" },
  optionActive: { background: "#f4f4f5" },
};

export default { name: "AddressAutocomplete" };
export { S };
</script>
