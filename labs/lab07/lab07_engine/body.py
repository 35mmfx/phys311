import numpy as np
from numpy.typing import ArrayLike, NDArray


class Body:
    """A two-dimensional rigid body with linear and angular state."""

    def __init__(
        self,
        mass: float,
        pos: ArrayLike,
        vel: ArrayLike,
        radius: float = 0.1,
        I: float | None = None,
    ) -> None:
        self.m = float(mass)
        self.r = self._vector(pos, "pos")
        self.v = self._vector(vel, "vel")
        self.radius = float(radius)
        self.theta = 0.0
        self.omega = 0.0
        self.I = float(I) if I is not None else 0.5 * self.m * self.radius**2
        self._validate_positive_finite(self.m, "mass")
        self._validate_positive_finite(self.radius, "radius")
        self._validate_positive_finite(self.I, "moment of inertia")
        self.force: NDArray[np.float64] = np.zeros(2, dtype=float)
        self.torque = 0.0

    @staticmethod
    def _vector(value: ArrayLike, name: str) -> NDArray[np.float64]:
        vector = np.asarray(value, dtype=float)
        if vector.shape != (2,) or not np.all(np.isfinite(vector)):
            raise ValueError(f"{name} must contain two finite numbers")
        return vector.copy()

    @staticmethod
    def _validate_positive_finite(value: float, name: str) -> None:
        if not np.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be a positive finite number")

    def clear_accumulators(self) -> None:
        self.force.fill(0.0)
        self.torque = 0.0
