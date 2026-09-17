export { createClient, LocioError, DEFAULT_BASE_URL, VERSION } from "./client";
export type { Client, ClientOptions, SearchOptions } from "./client";
export {
  useAddressAutocomplete,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MIN_LENGTH,
} from "./useAddressAutocomplete";
export type {
  UseAddressAutocomplete,
  UseAddressAutocompleteOptions,
  AutocompleteStatus,
} from "./useAddressAutocomplete";
export { default as AddressAutocomplete } from "./AddressAutocomplete.vue";
export { isUnit, addressId } from "./types";
export type { Address, AddressComponents, GnafRecord, Resolution } from "./types";
