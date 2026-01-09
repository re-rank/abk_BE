import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    // 특정 속성 요청 시 해당 속성 반환
    if (data && user) {
      return user[data];
    }
    
    return user;
  },
);

