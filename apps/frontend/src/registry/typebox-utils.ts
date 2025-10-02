import { Type, TSchema, TObject, TProperties, Static } from '@sinclair/typebox';
import { Kind, Hint } from '@sinclair/typebox';

const OptionalSymbol = Symbol.for('TypeBox.Optional');
const KindSymbol = Symbol.for('TypeBox.Kind');

export function isOptional(properties: any): boolean {
  return KindSymbol in properties && 
  properties[KindSymbol] && 
  OptionalSymbol in properties && 
  properties[OptionalSymbol] === 'Optional';
}

export function isUnionType(type: any): boolean {
  return type[Kind] === 'Union' && type[Hint] !== "Enum";
}

// Function to check if something is a TSchema object
export function isTSchema(value: unknown): value is TSchema {
  // Basic checks first
  if (!value || typeof value !== 'object') {
    return false;
  }
  
  // Check for TypeBox's internal Kind symbol
  // TypeBox schemas should have this symbol property
  return KindSymbol in value;
}

// Validate that all properties are TSchema objects
export function validateTSchemaRecord(obj: Record<string, any>): asserts obj is Record<string, TSchema> {
  for (const key in obj) {
    if (!isTSchema(obj[key])) {
      throw new Error(`Property "${key}" is not a valid TSchema object`);
    }
  }
}