import {MigrationInterface, QueryRunner} from "typeorm";

export class CatalogDisplay1791502712857 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSummary" character varying(300)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsFeatured" boolean DEFAULT false`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSortorder" integer DEFAULT '100'`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsAvailabilitynote" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsNote" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsNote"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsAvailabilitynote"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSortorder"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsFeatured"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSummary"`, undefined);
   }

}
