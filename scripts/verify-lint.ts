#!/usr/bin/env bun
/**
 * Wrapper de verificación para el hook `Stop` de Claude Code.
 *
 * Corre `biome check` sobre el repo. Si hay errores de lint o formato, sale
 * con código 2 — el contrato del hook `Stop` para devolver el detalle al
 * agente y obligarlo a corregir antes de terminar el turno. Sin errores → 0.
 *
 * `tsc` queda fuera a propósito: es lento para correr en cada turno y mejor
 * vive en CI. Biome corre en ~300ms.
 */
import { $ } from "bun";

const res = await $`bunx biome check`.nothrow().quiet();

if (res.exitCode === 0) process.exit(0);

console.error(
  "Hay errores de biome sin resolver. Corré `bun run lint:summary` para el " +
    "desglose por regla y arreglalos antes de terminar.\n",
);
console.error(res.stdout.toString().slice(-2000));
process.exit(2);
