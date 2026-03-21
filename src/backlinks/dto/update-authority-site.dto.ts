import { PartialType } from '@nestjs/swagger';
import { CreateAuthoritySiteDto } from './create-authority-site.dto';

export class UpdateAuthoritySiteDto extends PartialType(CreateAuthoritySiteDto) {}
