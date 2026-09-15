"""Portal domain errors."""

from __future__ import annotations


class PortalDomainError(Exception):
    pass


class OrderNotFoundError(PortalDomainError):
    def __init__(self, order_id: str):
        self.order_id = order_id
        super().__init__(f"Order {order_id} was not found")


class OrderStatusConflictError(PortalDomainError):
    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class SolutionNotFoundError(PortalDomainError):
    def __init__(self, order_id: str):
        self.order_id = order_id
        super().__init__(f"Order {order_id} has no active solution")


class SolutionHasRejectsError(PortalDomainError):
    def __init__(self, reject_count: int):
        self.reject_count = reject_count
        super().__init__(f"{reject_count} item(s) were not packed")


class DuplicateBoxReferenceError(PortalDomainError):
    pass


class DuplicateImportReferenceError(PortalDomainError):
    pass


class InventoryConsumptionError(PortalDomainError):
    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__(" ".join(issues))


class UserNotFoundError(PortalDomainError):
    pass


class DuplicateUserError(PortalDomainError):
    pass


class UserManagementConflictError(PortalDomainError):
    pass


class AuthAdminError(PortalDomainError):
    pass


class DuplicateAuthUserError(AuthAdminError):
    pass


class AuthAdminTransportError(AuthAdminError):
    pass
