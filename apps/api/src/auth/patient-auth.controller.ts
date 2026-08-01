import { Body, Controller, Post } from '@nestjs/common';
import { PatientAuthService } from './patient-auth.service';
import { RequestPatientOtpDto, VerifyPatientOtpDto } from './dto';

@Controller('auth/patient')
export class PatientAuthController {
  constructor(private readonly svc: PatientAuthService) {}

  @Post('otp/request')
  request(@Body() dto: RequestPatientOtpDto) {
    return this.svc.requestOtp(dto);
  }

  @Post('otp/verify')
  verify(@Body() dto: VerifyPatientOtpDto) {
    return this.svc.verifyOtp(dto);
  }
}
