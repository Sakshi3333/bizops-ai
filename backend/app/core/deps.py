import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise credentials_error

    user_id = payload.get("sub")
    company_id = payload.get("company_id")
    role = payload.get("role")
    if user_id is None or company_id is None or role is None:
        raise credentials_error

    # Tenant context is set by TenantContextMiddleware (app/core/tenant.py),
    # not here - see that middleware's docstring for why it has to live
    # there rather than in this (threadpool-run) dependency.
    user = db.scalar(select(User).where(User.id == uuid.UUID(user_id)))
    if user is None or not user.is_active:
        raise credentials_error

    return user


def require_role(*roles: UserRole):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _checker
