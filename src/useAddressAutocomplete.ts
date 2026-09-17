import { onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import { createClient, type Client, type ClientOptions } from "./client";
import type { Address } from "./types";

/**
 * How long a pause means somebody has stopped typing.
 *
 * Long enough that a burst of typing is one request, short enough that it
 * still feels like it is keeping up. It matters more here than in most
 * autocompletes: every call spends a unit of your quota, so a per keystroke
 * widget costs thirteen units to type one address.
 */
export const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Below this a prefix matches most of the country and the answer means
 * nothing. The API refuses under two characters anyway; three is where the
 * results start being worth showing.
 */
export const DEFAULT_MIN_LENGTH = 3;

/** What the box has to say, as one value rather than several booleans that
 *  can contradict each other. */
export type AutocompleteStatus =
  | "idle"
  | "searching"
  | "results"
  | "empty"
  | "unavailable";

export interface UseAddressAutocompleteOptions extends ClientOptions {
  debounceMs?: number;
  minLength?: number;
  limit?: number;
  client?: Client;
}

export interface UseAddressAutocomplete {
  term: Ref<string>;
  results: Ref<Address[]>;
  status: Ref<AutocompleteStatus>;
  error: Ref<unknown>;
  /** Forget the results without clearing the box: use after a selection. */
  clear(): void;
}

/**
 * The address autocomplete, without any opinion about how it looks.
 *
 * Everything that is easy to get wrong lives here: debouncing, cancelling a
 * superseded request, and telling an empty result apart from a failed one.
 * Write whatever template you like on top, or use `<AddressAutocomplete>` for
 * an accessible default.
 *
 * Writing to `term` is what drives it, so it drops straight onto `v-model`.
 */
export function useAddressAutocomplete(
  options: UseAddressAutocompleteOptions,
): UseAddressAutocomplete {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
    limit,
    client: given,
  } = options;

  const client =
    given ??
    createClient({
      publicKey: options.publicKey,
      baseUrl: options.baseUrl,
      fetch: options.fetch,
    });

  const term = ref("");
  const results = shallowRef<Address[]>([]);
  const status = ref<AutocompleteStatus>("idle");
  const error = shallowRef<unknown>(null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;

  function clear() {
    clearTimeout(timer);
    inFlight?.abort();
    results.value = [];
    status.value = "idle";
  }

  // Nothing may be left running when the scope goes away: a pending timer
  // would write to a ref nobody is reading, and an open request would hold a
  // connection nobody is waiting for.
  onScopeDispose(() => {
    clearTimeout(timer);
    inFlight?.abort();
  });

  watch(term, (next) => {
    clearTimeout(timer);

    if (next.trim().length < minLength) {
      inFlight?.abort();
      results.value = [];
      status.value = "idle";
      return;
    }

    status.value = "searching";
    timer = setTimeout(() => {
      // Cancelling rather than ignoring. An ignored response still held a
      // connection the whole time, and browsers allow six per host, so the
      // keystroke that matters ends up queued behind ones that do not.
      inFlight?.abort();
      const mine = new AbortController();
      inFlight = mine;

      client
        .search(next, { limit, signal: mine.signal })
        .then((found) => {
          if (mine.signal.aborted) return;
          results.value = found;
          status.value = found.length > 0 ? "results" : "empty";
          error.value = null;
        })
        .catch((err: unknown) => {
          // An abort is this composable superseding itself, not a failure,
          // and it must repaint nothing: a newer request owns the box now.
          if (mine.signal.aborted) return;
          results.value = [];
          error.value = err;
          status.value = "unavailable";
        });
    }, debounceMs);
  });

  return { term, results, status, error, clear };
}
