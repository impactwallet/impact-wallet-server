import { ApiHeader } from "@nestjs/swagger";

export const ApiMockHeader = (description: string) => ApiHeader({
  name: 'mock',
  description,
  enum: ['true', 'false'],
  required: false,
});