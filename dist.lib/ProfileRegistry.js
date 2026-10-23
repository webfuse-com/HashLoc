import { PROFILE_L, PROFILE_M, PROFILE_S } from "./constants.profiles.js";
import { validateProfile } from "./util.profile.js";
class ProfileRegistry {
  byVersion = /* @__PURE__ */ new Map();
  constructor(profiles = []) {
    for (const profile of profiles) {
      this.register(profile);
    }
  }
  register(profile) {
    validateProfile(profile);
    this.byVersion.set(profile.version, profile);
    return this;
  }
  get(version) {
    return this.byVersion.get(version);
  }
  byName(name) {
    let found;
    this.byVersion.forEach((profile) => {
      if (!found && profile.name === name) {
        found = profile;
      }
    });
    return found;
  }
}
const defaultRegistry = new ProfileRegistry([PROFILE_S, PROFILE_M, PROFILE_L]);
export {
  ProfileRegistry,
  defaultRegistry
};
