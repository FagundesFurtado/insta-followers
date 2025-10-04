from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def execute_values(
    cursor,
    sql: str,
    argslist: Sequence[Sequence[Any]],
    *,
    page_size: int = 100,
) -> None:
    if not argslist:
        return

    if "%s" not in sql:
        raise ValueError("SQL statement must contain a single '%s' placeholder for the values block")

    head, tail = sql.split("%s", 1)
    width = len(argslist[0])
    if width == 0:
        raise ValueError("Cannot build VALUES clause from empty rows")

    template = "(" + ", ".join(["%s"] * width) + ")"

    for row in argslist:
        if len(row) != width:
            raise ValueError("All rows must have the same length")

    if page_size <= 0:
        page_size = len(argslist)

    for start in range(0, len(argslist), page_size):
        chunk = argslist[start : start + page_size]
        values_clause = ", ".join(template for _ in chunk)
        params: list[Any] = []
        for row in chunk:
            params.extend(row)
        cursor.execute(head + values_clause + tail, params)
