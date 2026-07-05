import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;

  constructor(config: ConfigService) {
    this.token = config.get('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get('TELEGRAM_CHAT_ID');
  }

  async send(text: string) {
    if (!this.token || !this.chatId) return; // silenciosamente noop si no está configurado
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar aviso Telegram: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
