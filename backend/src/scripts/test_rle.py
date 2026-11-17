def encode_rle(data: bytes) -> bytes:
    i = 0
    n = len(data)
    out = bytearray()
    while i < n:
        run_len = 1
        while i + run_len < n and run_len < 128 and data[i + run_len] == data[i]:
            run_len += 1
        if run_len >= 3:
            out.append(257 - run_len)
            out.append(data[i])
            i += run_len
        else:
            lit_start = i
            while i < n and (i - lit_start) < 128:
                if i + 2 < n and data[i] == data[i+1] == data[i+2]:
                    break
                i += 1
            lit_len = i - lit_start
            out.append(lit_len - 1)
            out.extend(data[lit_start:i])
    out.append(128)
    return bytes(out)

test_bytes = b"AAAAABBBCCDDEFFFFFFFF" + b"\xFF" * 500
encoded = encode_rle(test_bytes)
print(f"Original: {len(test_bytes)} bytes, Encoded: {len(encoded)} bytes")
