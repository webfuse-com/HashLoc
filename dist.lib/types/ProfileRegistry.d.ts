import { type Profile } from "./types.js";
export declare class ProfileRegistry {
    private readonly byVersion;
    constructor(profiles?: Profile[]);
    register(profile: Profile): this;
    get(version: number): Profile | undefined;
    byName(name: string): Profile | undefined;
}
export declare const defaultRegistry: ProfileRegistry;
