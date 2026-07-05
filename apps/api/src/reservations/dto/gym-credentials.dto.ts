import { IsString, Length, Matches } from 'class-validator';

export class SaveGymCredentialsDto {
  @IsString()
  @Length(5, 20)
  @Matches(/^[0-9A-Za-z-]+$/, {
    message: 'DNI/carnet con formato inválido',
  })
  dni!: string;

  @IsString()
  @Length(4, 100)
  password!: string;
}
