import {MigrationInterface, QueryRunner} from "typeorm";

export class PaymentsMy1791515912530 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "hosted_payment_attempt" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderCode" character varying NOT NULL, "paymentMethodCode" character varying NOT NULL, "gateway" character varying(32) NOT NULL, "reference" character varying NOT NULL, "currencyCode" character varying(3) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "checkedAt" TIMESTAMP, "id" SERIAL NOT NULL, "orderId" integer NOT NULL, "channelId" integer NOT NULL, "amount" integer NOT NULL, CONSTRAINT "PK_627fa7442f6dcce806cefac49c2" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_feab0859947b6158b8bcce9867" ON "hosted_payment_attempt" ("orderId") `, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_18de05cffaf9a1da0e45c71826" ON "hosted_payment_attempt" ("gateway", "reference") `, undefined);
        await queryRunner.query(`ALTER TABLE "hosted_payment_attempt" ADD CONSTRAINT "FK_feab0859947b6158b8bcce98677" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "hosted_payment_attempt" DROP CONSTRAINT "FK_feab0859947b6158b8bcce98677"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_18de05cffaf9a1da0e45c71826"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_feab0859947b6158b8bcce9867"`, undefined);
        await queryRunner.query(`DROP TABLE "hosted_payment_attempt"`, undefined);
   }

}
