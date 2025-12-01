export type Product = {
    id: string;
    name: string;
    origin?: string;
    notes?: string;
    price: number;
    img?: string;
    roastLevel?: "light" | "medium" | "dark";
  };