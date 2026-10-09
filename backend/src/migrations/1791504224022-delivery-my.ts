import {MigrationInterface, QueryRunner} from "typeorm";

export class DeliveryMy1791504224022 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "delivery_distance" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "postcode" character varying(5) NOT NULL, "origin" character varying(40) NOT NULL, "destination" character varying NOT NULL, "distanceMeters" integer NOT NULL, "fetchedAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_9e231b79872fce4eaed8cbb1bd1" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe3e3d188afffab81d57a42452" ON "delivery_distance" ("postcode", "origin") `, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsPreferreddeliverydate" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsDeliverynotes" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsWeightgrams" integer DEFAULT '1000'`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsLengthcm" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsWidthcm" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsHeightcm" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "global_settings" ADD "customFieldsDeliverycloseddates" text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "global_settings" DROP COLUMN "customFieldsDeliverycloseddates"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsHeightcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsWidthcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsLengthcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsWeightgrams"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsDeliverynotes"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsPreferreddeliverydate"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fe3e3d188afffab81d57a42452"`, undefined);
        await queryRunner.query(`DROP TABLE "delivery_distance"`, undefined);
   }

}
