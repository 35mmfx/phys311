from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

from .body import Body
from .forces import Force

if TYPE_CHECKING:
    from .collisions import ElasticCircleCollisions
    from .integrators import Integrator


@dataclass(frozen=True)
class StateRecord:
    """An immutable state snapshot with linear and orbital-plus-spin momentum."""

    time: float
    positions: tuple[tuple[float, float], ...]
    angles: tuple[float, ...]
    kinetic_energy: float
    potential_energy: float
    momentum: tuple[float, float]
    angular_momentum: float

    @property
    def total_energy(self) -> float:
        return self.kinetic_energy + self.potential_energy


class World:
    """Owns bodies and forces and advances their simulation state."""

    def __init__(
        self,
        integrator: Integrator,
        collision_handler: ElasticCircleCollisions | None = None,
    ) -> None:
        self.bodies: list[Body] = []
        self.forces: list[Force] = []
        self.integrator = integrator
        self.collision_handler = collision_handler
        self.time = 0.0
        self.history: list[StateRecord] = []

    def add_body(self, body: Body) -> None:
        self.bodies.append(body)

    def add_force(self, force: Force) -> None:
        self.forces.append(force)

    def step(self, dt: float) -> None:
        dt = float(dt)
        if not np.isfinite(dt) or dt <= 0:
            raise ValueError("dt must be a positive finite number")

        if not self.history:
            self.record_state()
        for body in self.bodies:
            body.clear_accumulators()
        for force in self.forces:
            force.apply(self)
        self.integrator.step(self, dt)
        if self.collision_handler is not None:
            self.collision_handler.resolve(self, dt)
        self.time += dt
        self.record_state()

    def run(self, steps: int, dt: float) -> None:
        if not isinstance(steps, int) or isinstance(steps, bool) or steps < 0:
            raise ValueError("steps must be a non-negative integer")
        dt = float(dt)
        if not np.isfinite(dt) or dt <= 0:
            raise ValueError("dt must be a positive finite number")
        if not self.history:
            self.record_state()
        for _ in range(steps):
            self.step(dt)

    def record_state(self) -> StateRecord:
        positions = tuple(
            (float(body.r[0]), float(body.r[1])) for body in self.bodies
        )
        angles = tuple(float(body.theta) for body in self.bodies)
        momentum_vector = sum(
            (body.m * body.v for body in self.bodies),
            start=np.zeros(2, dtype=float),
        )
        kinetic_energy = sum(
            0.5 * body.m * float(np.dot(body.v, body.v))
            + 0.5 * body.I * body.omega**2
            for body in self.bodies
        )
        potential_energy = sum(
            force.potential_energy(self) for force in self.forces
        )
        record = StateRecord(
            time=self.time,
            positions=positions,
            kinetic_energy=float(kinetic_energy),
            potential_energy=float(potential_energy),
            momentum=(float(momentum_vector[0]), float(momentum_vector[1])),
            angles=angles,
            angular_momentum=float(
                sum(
                    body.r[0] * body.m * body.v[1]
                    - body.r[1] * body.m * body.v[0]
                    + body.I * body.omega
                    for body in self.bodies
                )
            ),
        )
        self.history.append(record)
        return record
