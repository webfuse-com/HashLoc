"""A localization without any candidate (bucket lookup, no matching bucket) counts as a miss."""
from datetime import date

from dataset import Classification, Element, Pair
from metrics import make_row


def test_empty_order_is_a_miss():
    target = Element.__new__(Element)
    target.chrome = "/html/body/div[1]"
    target.index = 0
    pair = Pair("site", date(2020, 1, 1), date(2020, 5, 1), 0, target, target, Classification("changed", "same"))
    row = make_row("HashLoc L [buckets r=3]", pair, [], [], 1.0, [ target ], [])
    assert row.rank == 0 and row.top1 == -1
    assert not (row.exact_match or row.top10 or row.parent_child or row.visual_overlap)
    assert row.fitness == 0 and row.fitness_max >= 0
