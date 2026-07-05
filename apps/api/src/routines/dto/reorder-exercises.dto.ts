import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderExercisesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}
