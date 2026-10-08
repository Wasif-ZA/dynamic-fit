import pytest

from app.order_references import format_order_reference


@pytest.mark.parametrize(
    "sequence_number, expected",
    [(1, "MQ-001"), (12, "MQ-012"), (123, "MQ-123"), (1000, "MQ-1000")],
)
def test_order_reference_padding(sequence_number, expected):
    assert format_order_reference(sequence_number) == expected


def test_order_reference_requires_a_positive_sequence():
    with pytest.raises(ValueError):
        format_order_reference(0)
