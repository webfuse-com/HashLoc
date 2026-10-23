const TEXT_ENCODER: TextEncoder = new TextEncoder();

const MURMUR_C1: number = 0xcc9e2d51;

const MURMUR_C2: number = 0x1b873593;


// Murmur3 finalizer: a cheap, well-mixing 32-bit integer hash.
export function fmix32(value: number): number {
	let hash: number = value;

	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x85ebca6b);
	hash ^= hash >>> 13;
	hash = Math.imul(hash, 0xc2b2ae35);
	hash ^= hash >>> 16;

	return hash >>> 0;
}

// MurmurHash3 x86 32-bit over the UTF-8 bytes of `text`. Deterministic across runtimes.
export function murmur3(text: string, seed: number = 0): number {
	const data: Uint8Array = TEXT_ENCODER.encode(text);
	const length: number = data.length;
	const blockEnd: number = length & ~3;
	let hash: number = seed >>> 0;

	for(let offset: number = 0; offset < blockEnd; offset += 4) {
		let block: number = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);

		block = Math.imul(block, MURMUR_C1);
		block = (block << 15) | (block >>> 17);
		block = Math.imul(block, MURMUR_C2);
		hash ^= block;
		hash = (hash << 13) | (hash >>> 19);
		hash = (Math.imul(hash, 5) + 0xe6546b64) | 0;
	}

	const tail: number = length & 3;
	let block: number = 0;

	if(tail === 3) {
		block ^= data[blockEnd + 2] << 16;
	}

	if(tail >= 2) {
		block ^= data[blockEnd + 1] << 8;
	}

	if(tail >= 1) {
		block ^= data[blockEnd];
		block = Math.imul(block, MURMUR_C1);
		block = (block << 15) | (block >>> 17);
		block = Math.imul(block, MURMUR_C2);
		hash ^= block;
	}

	hash ^= length;

	return fmix32(hash);
}

// Map a 32-bit hash to 1..2^bits-1 (0 is reserved for "empty").
export function nonZero(hash: number, bits: number): number {
	if(bits < 2 || bits > 31) {
		throw new RangeError(`bits must be in 2..31, got ${bits}`);
	}

	return 1 + (hash % (2 ** bits - 1));
}
