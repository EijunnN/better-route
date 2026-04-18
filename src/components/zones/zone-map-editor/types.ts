export interface ZoneMapEditorProps {
  initialGeometry?: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  zoneColor?: string;
  onSave: (geometry: string) => void;
  onCancel: () => void;
  height?: string;
  className?: string;
}

export type DrawMode = "select" | "draw" | "freehand" | "delete";

export type LngLat = [number, number];

export interface Midpoint {
  coord: LngLat;
  insertIndex: number;
}
