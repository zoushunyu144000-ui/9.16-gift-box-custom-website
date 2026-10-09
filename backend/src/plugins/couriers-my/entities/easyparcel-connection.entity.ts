import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * A merchant's EasyParcel account, connected per channel through OAuth. The tokens are sealed
 * (AES-256-GCM, key derived from EASYPARCEL_CLIENT_SECRET) and never leave the server.
 */
@Entity()
export class EasyParcelConnection extends VendureEntity {
    constructor(input?: DeepPartial<EasyParcelConnection>) {
        super(input);
    }

    @Index({ unique: true })
    @Column()
    channelId: string;

    @Column('text')
    sealedTokens: string;

    @Column({ type: Date, nullable: true, precision: 3 })
    expiresAt: Date | null;

    @Column({ type: Date, nullable: true, precision: 3 })
    refreshTokenExpiresAt: Date | null;

    @Column({ type: Date, nullable: true, precision: 3 })
    lastRefreshedAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    connectedByUserId: string | null;
}
