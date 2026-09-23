import { categoryEmoji } from "../lib/category-emoji";
import type { Category } from "./types";

const roots = [
  [
    "food",
    "Alimentación",
    "#d29858",
    "ShoppingBasket",
    "Comida, compra semanal y alimentación",
  ],
  [
    "transport",
    "Transporte",
    "#699e9a",
    "TrainFront",
    "Desplazamientos cotidianos",
  ],
  ["home", "Vivienda", "#577fa2", "House", "Vivienda, suministros y hogar"],
  ["leisure", "Ocio", "#9b87b1", "Gamepad2", "Entretenimiento y tiempo libre"],
  ["travel", "Viajes", "#c97560", "Folder", "Viajes, turismo y vacaciones"],
  ["health", "Salud", "#849c6c", "HeartPulse", "Salud, farmacia y medicina"],
  ["shopping", "Compras", "#ba879a", "ShoppingBag", "Compras personales"],
  ["income", "Ingresos", "#488766", "Wallet", "Ingresos y trabajo"],
  [
    "other",
    "Otros",
    "#9ba39d",
    "Ellipsis",
    "Otros movimientos sin categoría específica",
  ],
];
export const defaultCategories: Category[] = roots.map(
  ([id, name, color, icon, description]) => ({
    id,
    name,
    color,
    icon: categoryEmoji(icon),
    description,
  }),
);
const children = [
  [
    "supermarket",
    "Supermercado",
    "food",
    "Supermercado, panadería, frutería y compra semanal",
  ],
  [
    "restaurants",
    "Restaurantes",
    "food",
    "Restaurante, cafetería, bar y comida a domicilio",
  ],
  [
    "public-transport",
    "Transporte público",
    "transport",
    "Autobús, metro, cercanías y abono transporte",
  ],
  ["taxi", "Taxi/VTC", "transport", "Taxi, Uber, Cabify y VTC"],
  [
    "fuel",
    "Combustible",
    "transport",
    "Gasolina, gasóleo y estaciones de servicio",
  ],
  ["parking", "Parking", "transport", "Aparcamiento y estacionamiento"],
  [
    "rent",
    "Alquiler/Hipoteca",
    "home",
    "Alquiler de vivienda, hipoteca y arrendamiento",
  ],
  ["electricity", "Electricidad", "home", "Factura de luz y electricidad"],
  ["water", "Agua", "home", "Factura del agua"],
  ["gas", "Gas", "home", "Gas natural y calefacción"],
  [
    "internet",
    "Internet",
    "home",
    "Fibra, internet y telecomunicaciones del hogar",
  ],
  [
    "subscriptions",
    "Suscripciones",
    "leisure",
    "Suscripciones de entretenimiento y streaming",
  ],
  ["cinema", "Cine", "leisure", "Entradas de cine"],
  ["games", "Videojuegos", "leisure", "Videojuegos y consolas"],
  [
    "travel-transport",
    "Transporte",
    "travel",
    "Transporte de viajes y vacaciones",
  ],
  ["flights", "Vuelos", "travel-transport", "Billetes de avión y aerolíneas"],
  [
    "travel-train",
    "Tren",
    "travel-transport",
    "Billetes de tren de larga distancia",
  ],
  ["accommodation", "Alojamiento", "travel", "Alojamiento turístico"],
  ["hotel", "Hotel", "accommodation", "Hoteles y hostales"],
  [
    "apartment",
    "Apartamento",
    "accommodation",
    "Apartamento turístico y alquiler vacacional",
  ],
  ["pharmacy", "Farmacia", "health", "Medicamentos y farmacia"],
  [
    "medical",
    "Atención médica",
    "health",
    "Médico, dentista y consultas médicas",
  ],
  ["clothing", "Ropa", "shopping", "Ropa, calzado y complementos"],
  ["technology", "Tecnología", "shopping", "Electrónica y dispositivos"],
  ["salary", "Nómina", "income", "Salario, nómina, sueldo y haberes"],
  [
    "other-income",
    "Otros ingresos",
    "income",
    "Otros ingresos diferentes de la nómina",
  ],
];
for (const [id, name, parentId, description] of children) {
  const parent = defaultCategories.find((c) => c.id === parentId)!;
  defaultCategories.push({
    id,
    name,
    parentId,
    description,
    color: parent.color,
    icon: parent.icon,
  });
}
