def normalize_unique_string_list(values: list[str], *, label: str) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    duplicates: list[str] = []

    for value in values:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{label} cannot be blank.")
        if cleaned in seen:
            if cleaned not in duplicates:
                duplicates.append(cleaned)
            continue
        seen.add(cleaned)
        normalized.append(cleaned)

    if duplicates:
        raise ValueError(f"Duplicate {label.lower()} were provided: {', '.join(duplicates)}")

    return normalized


def normalize_string_mapping(
    values: dict[str, str],
    *,
    key_label: str,
    value_label: str,
) -> dict[str, str]:
    normalized: dict[str, str] = {}
    duplicates: list[str] = []

    for raw_key, raw_value in values.items():
        key = raw_key.strip()
        if not key:
            raise ValueError(f"{key_label} cannot be blank.")

        value = raw_value.strip()
        if not value:
            raise ValueError(f"{value_label} cannot be blank.")

        if key in normalized:
            if key not in duplicates:
                duplicates.append(key)
            continue

        normalized[key] = value

    if duplicates:
        raise ValueError(f"Duplicate {key_label.lower()} were provided: {', '.join(duplicates)}")

    return normalized
