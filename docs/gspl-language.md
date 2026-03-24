# GSPL Language Reference

GSPL (Generative Seed Programming Language) is a domain-specific language for declaring seeds — living genetic blueprints that evolve.

## File Format

GSPL files use the `.gspl` extension. UTF-8 encoding.

## Directives

```gspl
@gseed 1.0          // Version declaration (required)
@domain organism     // Default domain for seeds in this file
@ecosystem fantasy   // Optional ecosystem tag
```

## Seed Declaration

```gspl
seed "Fire Dragon" organism {
  health: scalar(250, 0, 500);
  attack: scalar(85, 0, 100);
  element: categorical("fire", ["fire", "ice", "lightning"]);
  color: vector([0.9, 0.2, 0.1]);
  damage_formula: expression("attack * (1 - defense/100)");
}
```

### Syntax
```
seed "<name>" <domain> {
  <gene_name>: <gene_type>(<args>);
  ...
}
```

## Gene Types

### Scalar
Numeric value with min/max bounds.
```gspl
health: scalar(100, 0, 200);
//             value, min, max
```

### Categorical
Enumerated choice from a set of options.
```gspl
role: categorical("warrior", ["warrior", "mage", "rogue", "healer"]);
//                 value,     options
```

### Vector
Multi-dimensional numeric array.
```gspl
position: vector([10.5, 0, -3.2]);
color: vector([0.9, 0.2, 0.1]);
```

### Expression
Compiled formula as a string.
```gspl
damage: expression("attack * (1 - target.defense / 100)");
speed_mod: expression("base_speed * (1 + agility / 50)");
```

### Struct
Nested key-value record.
```gspl
stats: struct({
  str: scalar(10, 1, 20),
  dex: scalar(14, 1, 20),
  con: scalar(12, 1, 20)
});
```

### Array
Variable-length sequence of genes.
```gspl
abilities: array([
  categorical("fireball", ["fireball", "shield", "heal"]),
  categorical("shield", ["fireball", "shield", "heal"])
]);
```

### Graph
Nodes and edges with gene-valued weights.
```gspl
connections: graph(5 nodes, 8 edges);
```

### Tensor
Multi-dimensional typed array.
```gspl
weights: tensor([0.1, 0.5, 0.3, 0.8], shape=[2, 2]);
```

### TimeSeries
Keyframe-interpolated values over time.
```gspl
animation: timeseries(linear, [0:0, 0.5:1, 1:0]);
//                    interp   t:value pairs
```

## Domains

Seeds belong to a domain that determines their expected gene structure:

| Domain | Typical Genes |
|--------|--------------|
| `organism` | health, attack, defense, speed, role, color |
| `vehicle` | speed, durability, fuel, capacity, terrain_type |
| `weapon` | damage, range, speed, weight, element |
| `building` | health, capacity, cost, style |
| `terrain` | height, moisture, temperature, biome |
| `plant` | health, size, growth_rate, resource_output |
| `material` | hardness, density, conductivity, color |

## Comments

```gspl
// Single-line comment

/* Multi-line
   comment */
```

## Multiple Seeds Per File

A single `.gspl` file can declare multiple seeds:

```gspl
@gseed 1.0
@domain organism
@ecosystem living_world

seed "Wolf" organism {
  health: scalar(80, 0, 150);
  speed: scalar(75, 0, 100);
  role: categorical("predator", ["predator", "prey"]);
}

seed "Deer" organism {
  health: scalar(50, 0, 100);
  speed: scalar(80, 0, 100);
  role: categorical("prey", ["predator", "prey"]);
}
```

## Evolution Blocks

```gspl
evolve {
  generations = 50
  mutation_rate = 0.05
  population_size = 100
  selection = "tournament"
}
```

## Standard Library

The GSPL runtime provides 162+ built-in functions across 8 modules:

- **Math** (42): sin, cos, sqrt, lerp, clamp, abs, floor, ceil, round, pow, log, exp...
- **Vector** (28): vec2, vec3, dot, cross, normalize, distance, magnitude...
- **Statistics** (25): mean, variance, std, percentile, correlation, regression...
- **Random** (15): uniform, gaussian, poisson, gamma, beta, exponential...
- **Geometry** (23): collision, bezier, convex_hull, triangulate, sdf...
- **Color** (21): rgb, hsl, hsv, blend, complement, triadic, analogous...
- **Physics** (19): gravity, momentum, energy, friction, spring, orbital...
- **Easing** (31): linear, quad_in, quad_out, cubic, elastic, bounce, back...
