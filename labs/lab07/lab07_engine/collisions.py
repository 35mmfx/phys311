from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .world import World


@dataclass(frozen=True)
class CollisionEvent:
    """Pair diagnostics for one resolved disk collision."""

    time: float
    body_a: int
    body_b: int
    momentum_before: tuple[float, float]
    momentum_after: tuple[float, float]
    kinetic_energy_before: float
    kinetic_energy_after: float
    normal_speed_before: float
    normal_speed_after: float


class ElasticCircleCollisions:
    """Resolve overlapping circular bodies with a restitution impulse."""

    def __init__(self, restitution: float = 1.0) -> None:
        self.restitution = float(restitution)
        if (
            not np.isfinite(self.restitution)
            or self.restitution < 0.0
            or self.restitution > 1.0
        ):
            raise ValueError("restitution must be between zero and one")
        self.events: list[CollisionEvent] = []

    def resolve(self, world: World, dt: float) -> None:
        for index_a, body_a in enumerate(world.bodies):
            for index_b in range(index_a + 1, len(world.bodies)):
                body_b = world.bodies[index_b]
                separation = body_b.r - body_a.r
                distance = float(np.linalg.norm(separation))
                minimum_distance = body_a.radius + body_b.radius
                if distance > minimum_distance:
                    continue

                if distance == 0.0:
                    relative_velocity = body_b.v - body_a.v
                    relative_speed = float(np.linalg.norm(relative_velocity))
                    if relative_speed == 0.0:
                        raise ValueError(
                            "Cannot resolve coincident bodies with identical velocities"
                        )
                    normal = -relative_velocity / relative_speed
                    distance = 0.0
                else:
                    normal = separation / distance

                inverse_mass_a = 1.0 / body_a.m
                inverse_mass_b = 1.0 / body_b.m
                inverse_mass_sum = inverse_mass_a + inverse_mass_b
                overlap = minimum_distance - distance
                body_a.r -= normal * overlap * inverse_mass_a / inverse_mass_sum
                body_b.r += normal * overlap * inverse_mass_b / inverse_mass_sum

                normal_speed_before = float(np.dot(body_b.v - body_a.v, normal))
                if normal_speed_before >= 0.0:
                    continue

                momentum_before = body_a.m * body_a.v + body_b.m * body_b.v
                kinetic_energy_before = (
                    0.5 * body_a.m * float(np.dot(body_a.v, body_a.v))
                    + 0.5 * body_b.m * float(np.dot(body_b.v, body_b.v))
                )
                impulse_magnitude = (
                    -(1.0 + self.restitution)
                    * normal_speed_before
                    / inverse_mass_sum
                )
                impulse = impulse_magnitude * normal
                body_a.v -= impulse * inverse_mass_a
                body_b.v += impulse * inverse_mass_b

                momentum_after = body_a.m * body_a.v + body_b.m * body_b.v
                kinetic_energy_after = (
                    0.5 * body_a.m * float(np.dot(body_a.v, body_a.v))
                    + 0.5 * body_b.m * float(np.dot(body_b.v, body_b.v))
                )
                normal_speed_after = float(np.dot(body_b.v - body_a.v, normal))
                self.events.append(
                    CollisionEvent(
                        time=world.time + dt,
                        body_a=index_a,
                        body_b=index_b,
                        momentum_before=(
                            float(momentum_before[0]),
                            float(momentum_before[1]),
                        ),
                        momentum_after=(
                            float(momentum_after[0]),
                            float(momentum_after[1]),
                        ),
                        kinetic_energy_before=float(kinetic_energy_before),
                        kinetic_energy_after=float(kinetic_energy_after),
                        normal_speed_before=normal_speed_before,
                        normal_speed_after=normal_speed_after,
                    )
                )
