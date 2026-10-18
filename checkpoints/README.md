# Block 2 Checkpoint

This checkpoint is a four-body disk-collision demo built on the Lab 7 engine.

## Architecture

- `Body` owns each disk's mass, radius, position, and velocity.
- `World` owns the bodies and registered forces, and advances the scene using the `EulerCromer` integrator.
- `Gravity` and `Drag` are separate force objects. Gravity is conservative; quadratic drag removes mechanical energy.
- `ElasticCircleCollisions` is an optional collision handler passed to `World`. It detects overlapping disks, corrects their positions, and applies an equal-and-opposite restitution impulse. Each collision event records pair momentum, kinetic energy, and normal speeds before and after impact.

## Run the demo

Open `labs/lab07/block_2_Checkpoint.ipynb` in VS Code and choose **Run All**. Run from top to bottom. The notebook runs the four-body scene, checks collision conservation, plots the trajectories and energy/momentum diagnostics, and saves the multi-panel presentation figure to `checkpoints/block2_checkpoint_results.png`.

The scene uses four equal disks, elastic restitution (`e = 1`), gravity, and quadratic drag. Since drag and gravity are external to the disk-only system, total momentum is not expected to be constant. Mechanical energy decreases because drag dissipates it. At each elastic body-body collision, the colliding pair's momentum and kinetic energy are conserved to floating-point precision.
