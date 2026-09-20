import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { ProbationRecordsModule } from './probation-records/probation-records.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { RegularizationDecisionsModule } from './regularization-decisions/regularization-decisions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: Number(configService.getOrThrow<string>('DB_PORT')),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),

    UsersModule,

    EmployeesModule,

    ProbationRecordsModule,

    EvaluationsModule,

    RegularizationDecisionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
