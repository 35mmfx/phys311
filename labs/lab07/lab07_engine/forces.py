from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .body import Body

if TYPE_CHECKING:
    from .world import World


class Force(ABC):
    """Base class for forces that act on the bodies in a world."""

    @abstractmethod
    def apply(self, world: World) -> None:
        """Add this force's contributions to the bodies' accumulators."""

    def potential_energy(self, _world: World) -> float:
        """Return this force's potential energy, or zero if it is nonconservative."""
        del _world
        return 0.0


class Gravity(Force):
    """Uniform acceleration; a scalar g points downward along the y-axis."""

    def __init__(self, g: float | ArrayLike = 9.81) -> None:
        if np.isscalar(g):
            magnitude = float(g)
            if not np.isfinite(magnitude) or magnitude < 0:
                raise ValueError("gravity magnitude must be a non-negative finite number")
            self.g: NDArray[np.float64] = np.array([0.0, -magnitude])
        else:
            acceleration = np.asarray(g, dtype=float)
            if acceleration.shape != (2,) or not np.all(np.isfinite(acceleration)):
                raise ValueError("gravity acceleration must contain two finite numbers")
            self.g = acceleration.copy()

    def apply(self, world: World) -> None:
        for body in world.bodies:
            body.force += body.m * self.g

    def potential_energy(self, world: World) -> float:
        return float(
            sum(-body.m * np.dot(self.g, body.r) for body in world.bodies)
        )


class Drag(Force):
    """Quadratic drag opposite to each body's direction of motion."""

    def __init__(self, c: float) -> None:
        self.c = float(c)
        if not np.isfinite(self.c) or self.c < 0:
            raise ValueError("drag coefficient must be a non-negative finite number")

    def apply(self, world: World) -> None:
        for body in world.bodies:
            body.force += -self.c * np.linalg.norm(body.v) * body.v


class Spring(Force):
    """A Hooke's-law spring from a fixed 2D anchor to every body."""

    def __init__(self, k: float, anchor: ArrayLike = (0.0, 0.0)) -> None:
        self.k = float(k)
        if not np.isfinite(self.k) or self.k < 0:
            raise ValueError("spring constant must be a non-negative finite number")
        self.anchor = np.asarray(anchor, dtype=float)
        if self.anchor.shape != (2,) or not np.all(np.isfinite(self.anchor)):
            raise ValueError("anchor must contain two finite numbers")
        self.anchor = self.anchor.copy()

    def apply(self, world: World) -> None:
        for body in world.bodies:
            body.force += -self.k * (body.r - self.anchor)

    def potential_energy(self, world: World) -> float:
        return float(
            sum(
                0.5 * self.k * float(np.dot(body.r - self.anchor, body.r - self.anchor))
                for body in world.bodies
            )
        )


class SpringLink(Force):
    """A spring coupling two bodies with equal and opposite forces."""

    def __init__(self, body_a: Body, body_b: Body, k: float, rest_length: float) -> None:
        if body_a is body_b:
            raise ValueError("a spring must connect two different bodies")
        self.body_a = body_a
        self.body_b = body_b
        self.k = float(k)
        self.rest_length = float(rest_length)
        if not np.isfinite(self.k) or self.k < 0:
            raise ValueError("spring constant must be a non-negative finite number")
        if not np.isfinite(self.rest_length) or self.rest_length < 0:
            raise ValueError("rest length must be a non-negative finite number")

    def apply(self, world: World) -> None:
        if self.body_a not in world.bodies or self.body_b not in world.bodies:
            raise ValueError("both spring endpoints must be added to the world")
        separation = self.body_b.r - self.body_a.r
        length = float(np.linalg.norm(separation))
        if length == 0.0:
            if self.rest_length == 0.0:
                return
            raise ValueError("spring endpoints overlap while rest length is non-zero")
        spring_force = self.k * (length - self.rest_length) * separation / length
        self.body_a.force += spring_force
        self.body_b.force -= spring_force

    def potential_energy(self, world: World) -> float:
        if self.body_a not in world.bodies or self.body_b not in world.bodies:
            return 0.0
        length = float(np.linalg.norm(self.body_b.r - self.body_a.r))
        return 0.5 * self.k * (length - self.rest_length) ** 2


class PendulumGravity(Force):
    """Gravitational torque and potential for a rigid pendulum about its pivot."""

    def __init__(self, body: Body, mass: float, g: float, com_distance: float) -> None:
        self.body = body
        self.mass = float(mass)
        self.g = float(g)
        self.com_distance = float(com_distance)
        if not np.isfinite(self.mass) or self.mass <= 0:
            raise ValueError("pendulum mass must be a positive finite number")
        if not np.isfinite(self.g) or self.g < 0:
            raise ValueError("gravity magnitude must be a non-negative finite number")
        if not np.isfinite(self.com_distance) or self.com_distance < 0:
            raise ValueError("center-of-mass distance must be a non-negative finite number")

    def apply(self, world: World) -> None:
        if self.body in world.bodies:
            self.body.torque += (
                -self.mass * self.g * self.com_distance * np.sin(self.body.theta)
            )

    def potential_energy(self, world: World) -> float:
        if self.body not in world.bodies:
            return 0.0
        return float(
            self.mass
            * self.g
            * self.com_distance
            * (1.0 - np.cos(self.body.theta))
        )
