import { describe, expect, it } from "vitest";

import { REQUIRED_METHODS, checkSchema } from "@/lib/genlayer/mandate";

import schema from "./fixtures/mandate-schema.json";

/**
 * The schema GenLayer derived from the deployed contract (written by
 * scripts/inspect.py --write-deployment). Every call this app makes must
 * exist there with the same parameters, in the same order.
 */
describe("the frontend is wired against the deployed schema", () => {
  it("every method and parameter the app uses exists on the deployment", () => {
    expect(checkSchema(schema)).toBeNull();
  });

  it("writes are the four the contract exposes, none payable", () => {
    const methods = (schema as { methods: Record<string, { readonly: boolean; payable?: boolean | null }> }).methods;
    const writes = Object.entries(methods).filter(([, m]) => !m.readonly).map(([n]) => n).sort();
    expect(writes).toEqual(["create_mandate", "request_authorization", "revoke_mandate", "update_mandate"]);
    expect(writes.every((n) => !methods[n].payable)).toBe(true);
    expect(Object.keys(REQUIRED_METHODS).every((n) => n in methods)).toBe(true);
  });

  it("an impostor contract is refused, naming what is missing", () => {
    const { request_authorization: _dropped, ...rest } = (schema as { methods: Record<string, unknown> }).methods;
    void _dropped;
    expect(checkSchema({ methods: rest })).toMatch(/no request_authorization method/);
    const renamed = structuredClone(schema) as unknown as { methods: Record<string, { params: [string, string][] }> };
    renamed.methods.revoke_mandate.params = [["id", "string"]];
    expect(checkSchema(renamed)).toMatch(/revoke_mandate method takes different parameters/);
    expect(checkSchema(null)).toMatch(/No contract schema/);
  });
});
