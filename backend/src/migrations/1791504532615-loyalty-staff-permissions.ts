import {MigrationInterface, QueryRunner} from "typeorm";

export class LoyaltyStaffPermissions1791504532615 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "loyalty_points_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "points" integer NOT NULL, "reason" character varying NOT NULL, "note" text, "uniqueKey" character varying, "id" SERIAL NOT NULL, "customerId" integer NOT NULL, "orderId" integer, "administratorId" integer, CONSTRAINT "UQ_49b7f98597d8a783eab55416c67" UNIQUE ("uniqueKey"), CONSTRAINT "PK_855e13837828a94243dcec216a7" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_db464526acbe486a038bac00b3" ON "loyalty_points_entry" ("customerId") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_488f8c22d1cb1eae8badd07623" ON "loyalty_points_entry" ("orderId") `, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsLoyaltypointsapplied" integer NOT NULL DEFAULT '0'`, undefined);
        await queryRunner.query(`ALTER TABLE "customer" ADD "customFieldsLoyaltypoints" integer NOT NULL DEFAULT '0'`, undefined);
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" ADD CONSTRAINT "FK_db464526acbe486a038bac00b32" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" ADD CONSTRAINT "FK_488f8c22d1cb1eae8badd076231" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" ADD CONSTRAINT "FK_7294c8b0d316a476d27d5139009" FOREIGN KEY ("administratorId") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" DROP CONSTRAINT "FK_7294c8b0d316a476d27d5139009"`, undefined);
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" DROP CONSTRAINT "FK_488f8c22d1cb1eae8badd076231"`, undefined);
        await queryRunner.query(`ALTER TABLE "loyalty_points_entry" DROP CONSTRAINT "FK_db464526acbe486a038bac00b32"`, undefined);
        await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "customFieldsLoyaltypoints"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsLoyaltypointsapplied"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_488f8c22d1cb1eae8badd07623"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_db464526acbe486a038bac00b3"`, undefined);
        await queryRunner.query(`DROP TABLE "loyalty_points_entry"`, undefined);
   }

}
