from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .world import World


class Integrator(ABC):
    """Base class for numerical methods that advance a world's bodies."""

    @abstractmethod
    def step(self, world: World, dt: float) -> None:
        """Advance every body in the world by one timestep."""


class EulerCromer(Integrator):
    """Semi-implicit Euler method, updating velocity before position."""

    def step(self, world: World, dt: float) -> None:
        for body in world.bodies:
            acceleration = body.force / body.m
            body.v += acceleration * dt
            body.r += body.v * dt
            angular_acceleration = body.torque / body.I
            body.omega += angular_acceleration * dt
            body.theta += body.omega * dt
