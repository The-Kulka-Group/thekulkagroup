# LA-1325: Building Form card

A-2, Building Form, is the plan shape the budget assumes for a new multifamily building.
The Building View draws it, and it is the first card an IFC export would read. It prices
nothing yet. The rule lives in `lib/rom/building-form.ts`, and the card lives in
`lib/rom/building-form-criterion.ts`.

## 1. Card

**Code:** A-2. **Label:** Building Form. **Value:** Bar, L-Shape, U-Shape or Courtyard.
**Names:** item 8, exterior walls, because an L or a U has more outside wall per square
foot than a bar. It moves no price until a wall rate reads the perimeter.

## 2. Facts

- **Gross Square Feet**, stated.
- **Stories Above Grade**, stated.
- **Building Count**, stated, or one assumed when the intake has no answer.

## 3. Arithmetic

1. The floor plate is gross square feet, divided by building count, divided by stories.
2. Each wing is a double-loaded corridor 64 ft deep: two 29 ft units and a 6 ft corridor.
   The corridor's length is the plate divided by 64.
3. Up to 300 ft of corridor, the building stays one bar. Past 300 ft it folds into an L.
   Past 480 ft it folds into a U, and past 720 ft into a closed courtyard.
4. Each shape splits the corridor into wings in set shares: an L is 58 and 42 percent,
   a U is 28, 44 and 28 percent, and a courtyard is 30, 20, 30 and 20 percent. Every
   shape builds its front and right walls solid, because the stage cuts the site open
   there to show the foundation.
5. At five or six stories the front wing drops one story. At seven or more it drops two.
   The area it gives up goes back into every wing's length, so the gross never changes.
6. The facade reads in 28 ft bays, about one unit wide, counted around the outside wall
   (every wing's edges less the walls two wings share).

A plate under 96 ft of corridor has no real corridor, so it draws as a plain block,
1.65 to 1 along the street, which is how the stage drew every building before A-2.

## 4. Corrections

The card offers the four shapes. The stage redraws a picked shape at once. When the plate
cannot hold it (a U needs 390 ft of corridor and a courtyard 570 ft, so the court is at
least 40 ft across), it draws the largest shape that fits instead.

## 5. Confidence

The card always reads low. With no site plan, the shape follows from the floor plate's
length alone. The fold lengths, the shares and the step rule are the stage's own planning
rule, not a code limit. A site plan or a correction replaces them.

## 6. For an IFC export later

Each wing is an axis-aligned rectangle in feet with its own story count, and the stage
model (`lib/rom/stage-model.ts`) carries each level's base and height. That maps straight
onto `IfcBuildingStorey` for each level, with an extruded slab and walls for each wing
that reaches that level. Nothing about the shape lives only in the three.js code.
