function decodeBase64MsgPack(base64) {
    const binary = atob(base64);
    let offset = 0;

    function decode() {
        const byte = binary.charCodeAt(offset++);

        // Positive FixInt (0x00 to 0x7f)
        if (byte <= 0x7f) return byte;

        // FixMap (0x80 to 0x8f)
        if ((byte & 0xf0) === 0x80) {
            const size = byte & 0x0f;
            const map = {};
            for (let i = 0; i < size; i++) {
                const key = decode();
                const value = decode();
                map[key] = value;
            }
            return map;
        }

        // FixArray (0x90 to 0x9f)
        if ((byte & 0xf0) === 0x90) {
            const size = byte & 0x0f;
            const arr = [];
            for (let i = 0; i < size; i++) {
                arr.push(decode());
            }
            return arr;
        }

        // FixStr (0xa0 to 0xbf)
        if ((byte & 0xe0) === 0xa0) {
            const length = byte & 0x1f;
            const strBytes = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(new TextEncoder().encode(strBytes));
        }

        // nil (0xc0)
        if (byte === 0xc0) return null;

        // false (0xc2)
        if (byte === 0xc2) return false;

        // true (0xc3)
        if (byte === 0xc3) return true;

        // uint8 (0xcc)
        if (byte === 0xcc) return binary.charCodeAt(offset++);

        // uint16 (0xcd)
        if (byte === 0xcd) {
            const val = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            return val;
        }

        // uint32 (0xce)
        if (byte === 0xce) {
            const val = (binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
            offset += 4;
            return val >>> 0;
        }

        // uint64 (0xcf)
        if (byte === 0xcf) {
            const val = (BigInt(binary.charCodeAt(offset)) << 56n) | (BigInt(binary.charCodeAt(offset + 1)) << 48n) |
                (BigInt(binary.charCodeAt(offset + 2)) << 40n) | (BigInt(binary.charCodeAt(offset + 3)) << 32n) |
                (BigInt(binary.charCodeAt(offset + 4)) << 24n) | (BigInt(binary.charCodeAt(offset + 5)) << 16n) |
                (BigInt(binary.charCodeAt(offset + 6)) << 8n) | BigInt(binary.charCodeAt(offset + 7));
            offset += 8;
            return val;
        }

        // int8 (0xd0)
        if (byte === 0xd0) {
            const val = binary.charCodeAt(offset++);
            return val > 0x7f ? val - 0x100 : val;
        }

        // int16 (0xd1)
        if (byte === 0xd1) {
            const val = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            return val > 0x7fff ? val - 0x10000 : val;
        }

        // int32 (0xd2)
        if (byte === 0xd2) {
            const val = (binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
            offset += 4;
            return val > 0x7fffffff ? val - 0x100000000 : val;
        }

        // int64 (0xd3)
        if (byte === 0xd3) {
            const val = (BigInt(binary.charCodeAt(offset)) << 56n) | (BigInt(binary.charCodeAt(offset + 1)) << 48n) |
                (BigInt(binary.charCodeAt(offset + 2)) << 40n) | (BigInt(binary.charCodeAt(offset + 3)) << 32n) |
                (BigInt(binary.charCodeAt(offset + 4)) << 24n) | (BigInt(binary.charCodeAt(offset + 5)) << 16n) |
                (BigInt(binary.charCodeAt(offset + 6)) << 8n) | BigInt(binary.charCodeAt(offset + 7));
            offset += 8;
            return val;
        }

        // str8 (0xd9)
        if (byte === 0xd9) {
            const length = binary.charCodeAt(offset++);
            const strBytes = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(new TextEncoder().encode(strBytes));
        }

        // str16 (0xda)
        if (byte === 0xda) {
            const length = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            const strBytes = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(new TextEncoder().encode(strBytes));
        }

        // str32 (0xdb)
        if (byte === 0xdb) {
            const length = (binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
            offset += 4;
            const strBytes = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(new TextEncoder().encode(strBytes));
        }

        // array16 (0xdc)
        if (byte === 0xdc) {
            const length = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            const arr = [];
            for (let i = 0; i < length; i++) {
                arr.push(decode());
            }
            return arr;
        }

        // array32 (0xdd)
        if (byte === 0xdd) {
            const length = (binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
            offset += 4;
            const arr = [];
            for (let i = 0; i < length; i++) {
                arr.push(decode());
            }
            return arr;
        }

        // map16 (0xde)
        if (byte === 0xde) {
            const size = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            const map = {};
            for (let i = 0; i < size; i++) {
                const key = decode();
                const value = decode();
                map[key] = value;
            }
            return map;
        }

        // map32 (0xdf)
        if (byte === 0xdf) {
            const size = (binary.charCodeAt(offset) << 24) | (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) | binary.charCodeAt(offset + 3);
            offset += 4;
            const map = {};
            for (let i = 0; i < size; i++) {
                const key = decode();
                const value = decode();
                map[key] = value;
            }
            return map;
        }

        throw new Error(`Unsupported or unimplemented MessagePack byte: 0x${byte.toString(16)}`);
    }

    return decode();
}
