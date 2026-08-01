import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class SignupOwnerDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() fullName!: string;
  @IsString() accountName!: string;
  @IsOptional() @IsString() timezone?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class RequestPatientOtpDto {
  @IsString() phone!: string; // E.164
}

export class VerifyPatientOtpDto {
  @IsString() phone!: string;
  @IsString() code!: string;
}
