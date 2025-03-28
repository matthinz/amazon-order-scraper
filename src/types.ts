import readline from "node:readline/promises";
import { DataStore } from "./datastore.ts";

export type SubcommandOptions = {
  args: string[];
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  datastore: DataStore;
  dataDir: string;
  user: string;
  rl: readline.Interface;
  interactionAllowed: boolean;
};

export type OrderItem = {
  name: string;
  price: string;
  priceCents: number;
  quantity: number;
};

type BasePayment = {
  date: string;
  amount: string;
  amountCents: number;
};

export type CreditCardPayment = BasePayment & {
  type: "credit_card";
  cardType: string;
  last4: string;
};

export type GiftCardPayment = BasePayment & {
  type: "gift_card";
};

export type Payment = CreditCardPayment | GiftCardPayment;

export type ShippingAddress = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type Shipment = {
  date?: string;
  shippingAddress: ShippingAddress;
  items: OrderItem[];
};

export type Order = {
  id: string;
  currency: string;
  date?: string;
  payments: Payment[];
  placedBy?: string;
  shipments: Shipment[];
  shippingCost?: string;
  shippingCostCents?: number;
  subtotal: string;
  subtotalCents: number;
  tax: string;
  taxCents: number;
  total: string;
  totalCents: number;
};
