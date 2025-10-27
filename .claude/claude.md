# Project Documentation

## Three.js Shading Language (TSL)

This project uses Three.js Shading Language (TSL) for custom shaders and post-processing effects.

### TSL Documentation
- **Official Wiki**: https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- Always refer to this documentation when implementing TSL-based shaders, materials, or post-processing effects
- TSL provides a modern, type-safe way to write shaders in Three.js

### Key TSL Concepts
- Use `Fn()` to define shader functions
- Use typed nodes like `vec3()`, `vec4()`, `float()`, `int()` for variables
- Use `uniform()` for passing data from JavaScript to shaders
- Use `pass()` to create post-processing passes
- Loop with `Loop({ start, end })` instead of traditional for loops
- Conditional logic with `If()`, `Break()`, `Continue()`

### Current Implementation
This project includes:
- Volumetric lighting using TSL
- Bloom post-processing effect
- Custom shader functions for lighting and effects
