function decodeBase64MsgPack(base64) {
    const binary = atob(base64);
    let offset = 0;

    function readUint32BE(pos) {
        return (
            (binary.charCodeAt(pos)     << 24)  |
            (binary.charCodeAt(pos + 1) << 16)  |
            (binary.charCodeAt(pos + 2) << 8)   |
             binary.charCodeAt(pos + 3)
        ) >>> 0;
    }

    function decode() {
        const byte = binary.charCodeAt(offset++);

        if (byte <= 0x7f) return byte;

        if (byte >= 0xe0) return byte - 0x100;

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

        // FixArray
        if ((byte & 0xf0) === 0x90) {
            const size = byte & 0x0f;
            const arr = [];
            for (let i = 0; i < size; i++) arr.push(decode());
            return arr;
        }

        // FixStr
        if ((byte & 0xe0) === 0xa0) {
            const length = byte & 0x1f;
            const str = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(Uint8Array.from(str, c => c.charCodeAt(0)));
        }

        if (byte === 0xc0) return null;
        if (byte === 0xc2) return false;
        if (byte === 0xc3) return true;

        if (byte === 0xcc) return binary.charCodeAt(offset++);

        if (byte === 0xcd) {
            const val = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            return val;
        }

        if (byte === 0xce) {
            const val = readUint32BE(offset);
            offset += 4;
            return val;
        }

        if (byte === 0xcf) {
            const high = readUint32BE(offset);
            const low = readUint32BE(offset + 4);
            offset += 8;
            return high * 2**32 + low;
        }

        if (byte === 0xd0) {
            const val = binary.charCodeAt(offset++);
            return val > 0x7f ? val - 0x100 : val;
        }

        if (byte === 0xd1) {
            const val = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            return val > 0x7fff ? val - 0x10000 : val;
        }

        if (byte === 0xd2) {
            const val = (binary.charCodeAt(offset) << 24) |
                (binary.charCodeAt(offset + 1) << 16) |
                (binary.charCodeAt(offset + 2) << 8) |
                binary.charCodeAt(offset + 3);
            offset += 4;
            return val | 0;
        }

        if (byte === 0xd3) {
            const high = readUint32BE(offset);
            const low = readUint32BE(offset + 4);
            offset += 8;
            return high * 2**32 + low;
        }

        if (byte === 0xd9) {
            const length = binary.charCodeAt(offset++);
            const str = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(Uint8Array.from(str, c => c.charCodeAt(0)));
        }

        if (byte === 0xda) {
            const length = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            const str = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(Uint8Array.from(str, c => c.charCodeAt(0)));
        }

        if (byte === 0xdb) {
            const length = readUint32BE(offset);
            offset += 4;
            const str = binary.slice(offset, offset + length);
            offset += length;
            return new TextDecoder().decode(Uint8Array.from(str, c => c.charCodeAt(0)));
        }

        if (byte === 0xdc) {
            const length = (binary.charCodeAt(offset) << 8) | binary.charCodeAt(offset + 1);
            offset += 2;
            const arr = [];
            for (let i = 0; i < length; i++) arr.push(decode());
            return arr;
        }

        if (byte === 0xdd) {
            const length = readUint32BE(offset);
            offset += 4;
            const arr = [];
            for (let i = 0; i < length; i++) arr.push(decode());
            return arr;
        }

        let in_item = 0
        
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

        if (byte === 0xdf) {
            const size = readUint32BE(offset);
            offset += 4;
            const map = {};

            for (let i = 0; i < size; i++) {
                const key = decode();
                const value = decode();
                map[key] = value;
            }
            return map;
        }

        throw new Error(`Unsupported byte: 0x${byte.toString(16)}`);
    }

    return decode();
}
