"""Formatting for externally displayed Portal order references."""

# TODO: Replace this temporary value with persistent deployment/environment
# configuration when deployment setup is implemented.
DEFAULT_COMPANY_CODE = "MQ"


def format_order_reference(sequence_number: int) -> str:
    """Format a positive sequence with three-digit minimum padding."""
    if sequence_number < 1:
        raise ValueError("Order reference sequence numbers must be positive")
    return f"{DEFAULT_COMPANY_CODE}-{sequence_number:03d}"
