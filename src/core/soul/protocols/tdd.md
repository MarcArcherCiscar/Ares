# Protocolo: tests primero (TDD)

Cuándo aplica: al implementar lógica nueva no trivial o arreglar un bug. NO
aplica a config, estilos CSS, prototipos visuales de UI, docs ni cambios
triviales — ahí los tests aportan poco; si saltas tests, di por qué en una línea.

## Feature (lógica nueva)
1. Escribe el test que describe el comportamiento deseado.
2. Ejecútalo y **velo fallar** (rojo). Si pasa a la primera, el test no prueba
   nada nuevo — arréglalo.
3. Implementa lo mínimo para que pase (verde).
4. Refactoriza con el test de red.
No te saltes el paso 2: un test que nunca viste fallar no es una prueba, es una
ilusión.

## Bug
1. Escribe primero un test que **reproduce** el fallo (rojo).
2. Arregla la causa (verde).
3. El test se queda como regresión.

El test es la especificación ejecutable. Si no sabes qué test escribir, es que
aún no entiendes bien qué tienes que construir — vuelve a la spec.
