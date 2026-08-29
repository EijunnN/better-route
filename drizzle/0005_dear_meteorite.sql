ALTER TABLE "zones" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
-- Hasta ahora el borrado de una zona era `active = false`, la misma bandera que
-- el usuario usa para pausarla desde el form: editar una zona borrada y marcarla
-- activa la resucitaba. Al separar los conceptos, las que hoy están en false son
-- borrados (verificado contra los datos: la única fila en ese estado vino de un
-- DELETE, que además desactiva sus zone_vehicles).
UPDATE "zones" SET "deleted_at" = "updated_at" WHERE "active" = false;--> statement-breakpoint
-- La columna es jsonb pero se guardaba `JSON.stringify(geometry)`, o sea un JSON
-- string adentro del jsonb. Los mapas de planificación y optimización pasan
-- `zone.geometry` directo a MapLibre y el point-in-polygon lee `.coordinates`:
-- con un string no dibujaban nada y no matcheaban ningún pedido.
UPDATE "zones" SET "geometry" = ("geometry" #>> '{}')::jsonb WHERE jsonb_typeof("geometry") = 'string';
