import * as HashLocAPI from "./api.js";


declare global {
	interface Window {
		HashLoc: typeof HashLocAPI;
	}
}


window.HashLoc = {
	...HashLocAPI
};
