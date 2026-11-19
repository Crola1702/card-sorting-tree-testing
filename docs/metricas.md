# Cómo se calcula cada métrica

Las fórmulas viven en `src/analysis.ts` (probadas en `src/analysis.test.ts`) y el panel (`npm run report`) las
recalcula cada vez que cambias el filtro de perfil. Este documento explica qué significa cada número y **sobre qué
base se calcula**: un porcentaje sin su base se puede malinterpretar.

## Reglas generales

- **El filtro de perfil se aplica primero.** Todas las métricas usan solo a los participantes que cumplen el filtro
  (cargo, grado de membresía, experiencia como directivo, uso previo de la wiki, rango de años en IEEE).
- **Base 0 = "sin base".** Si una base es 0, el porcentaje no existe y el panel muestra "sin base", nunca 0%.
- **Cada porcentaje se muestra con su conteo**, por ejemplo `40% (2/5)`: 2 casos de una base de 5.
- **Datos antiguos.** Las filas guardadas antes de la migración `20261119050000` no tienen los campos nuevos: las
  tarjetas cuentan como entendidas y el resultado de cada tarea se deriva de `correct` (verdadero = éxito, falso =
  fallo). Antes de esa versión todo se guardaba al final, así que esos participantes no tienen abandonos.

## Card sorting

Por estudio:

- **Empezaron**: participantes del estudio que pasan el filtro (llenaron el perfil).
- **Enviaron**: los que guardaron el card sort. La diferencia con "Empezaron" es el abandono del card sort.

Por tarjeta:

- **% "No sé qué significa"** = participantes que marcaron la tarjeta ÷ participantes que **enviaron** el card sort.
  Quien abandonó no cuenta, porque no sabemos qué habría hecho con la tarjeta.
- **Tarjetas más no entendidas**: las tarjetas con al menos una marca, ordenadas de más a menos marcas.
- **"¿Qué crees que significa?"**: las suposiciones escritas, tal cual. Sirven para ver qué entiende la gente por
  el término, pero no se cuentan como acierto ni como error.

Matriz de similitud y dendrograma:

- **Similitud(A, B)** = participantes que pusieron A y B en el **mismo grupo** ÷ participantes que **agruparon
  ambas** (ninguna de las dos marcada como no entendida).
- **Exclusión de tarjetas no entendidas**: si una persona marcó A como no entendida, esa persona no aporta a
  ningún par que incluya A. No se cuenta como "separada" de las demás, porque eso inventaría un dato.
- **Aviso de exclusión**: el panel dice cuántas marcas se excluyeron, de cuántos participantes, y qué tarjetas
  quedaron fuera por completo porque **nadie** las agrupó.
- **Par sin datos** (nadie agrupó ambas): la matriz muestra "n/d" y el dendrograma lo trata como distancia máxima.
- **Dendrograma**: agrupamiento jerárquico por **enlace promedio**, con distancia = 1 − similitud. Dos tarjetas que
  se unen más a la izquierda son más parecidas para los participantes.

## Tree testing

Cada participante que empezó el estudio termina cada tarea en **uno solo** de estos estados:

| Estado | Qué hizo |
|---|---|
| Éxito | Eligió uno de los nodos correctos |
| Éxito directo | Éxito sin usar "Volver" ni una vez (es un subconjunto de Éxito) |
| Fallo | Eligió un nodo que no es correcto |
| No sé | Tocó "No sé dónde buscaría esto" |
| Omitida | Tocó "Esta tarea no aplica a mi rol" |
| Abandono | Empezó el estudio pero no llegó a responder esta tarea (no hay fila suya para la tarea) |

**"No sé", "omitida" y "abandono" nunca se cuentan como éxito ni como error.**

Bases, por tarea:

| Métrica | Fórmula | Base |
|---|---|---|
| Omitida | omitieron ÷ empezaron | **Empezaron**: participantes del estudio con el filtro |
| Abandono | abandonaron ÷ empezaron | Empezaron |
| No sé | "no sé" ÷ respondieron | **Respondieron** = empezaron − omitieron − abandonaron |
| Éxito | éxitos ÷ eligieron | **Eligieron un nodo** = éxitos + fallos |
| Éxito directo | éxitos directos ÷ eligieron | Eligieron un nodo |
| Fallo | fallos ÷ eligieron | Eligieron un nodo |
| Confianza promedio | promedio de las respuestas 1 a 5 | Quienes la indicaron (solo se pregunta tras elegir un nodo; es opcional) |

Notas:

- Éxito + Fallo = 100% de quienes eligieron un nodo.
- Para una lectura más estricta de la tarea, mira juntos "No sé" y "Éxito": una tarea con 90% de éxito pero 40% de
  "no sé" no es fácil de encontrar.
- **Una tarea omitida por todos** queda con 100% de omitidas y todas las demás tasas "sin base".
- **Abandono e incompletos**: como las tareas se muestran en orden aleatorio, quien abandona a mitad de camino deja
  sin fila algunas tareas al azar, y esas tareas suman abandono.
- **Tareas listadas**: las que tienen al menos una fila de cualquier participante del estudio.
- **Metas de VALIDACION.md** (al menos 80% de éxito y 60% de éxito directo): con estas bases, se comparan contra
  quienes eligieron un nodo. Informa también el % de "no sé" para no esconder a quienes no supieron dónde buscar.
