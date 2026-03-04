/**
 * Global type declarations for the CRE/Javy runtime environment.
 * btoa and atob are natively supported in the Javy WASM runtime
 * but are not included in TypeScript's ESNext lib.
 */
declare function btoa(data: string): string;
declare function atob(encodedData: string): string;
