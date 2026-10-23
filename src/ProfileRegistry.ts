import { type Profile } from "./types.js";
import { PROFILE_L, PROFILE_M, PROFILE_S } from "./constants.profiles.js";
import { validateProfile } from "./util.profile.js";


// Maps the 4-bit version prefix of a code to the profile that decodes it.
export class ProfileRegistry {
	private readonly byVersion: Map<number, Profile> = new Map<number, Profile>();

	constructor(profiles: Profile[] = []) {
		for(const profile of profiles) {
			this.register(profile);
		}
	}

	register(profile: Profile): this {
		validateProfile(profile);
		this.byVersion.set(profile.version, profile);

		return this;
	}

	get(version: number): Profile | undefined {
		return this.byVersion.get(version);
	}

	byName(name: string): Profile | undefined {
		let found: Profile | undefined;

		this.byVersion.forEach((profile: Profile) => {
			if(!found && profile.name === name) {
				found = profile;
			}
		});

		return found;
	}
}


export const defaultRegistry: ProfileRegistry = new ProfileRegistry([ PROFILE_S, PROFILE_M, PROFILE_L ]);
