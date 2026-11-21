import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como o Mosaico trata os dados pessoais de quem se cadastra, compra e acessa os kits de templates.",
};

/**
 * Selo visual para qualquer informação que ainda depende de dado que só
 * a Ana tem (razão social, CNPJ, canal de contato, prazo de retenção
 * etc.) — nunca um valor inventado no lugar, sempre este aviso, pra
 * ninguém ler como se já fosse definitivo. Borda lateral (não fundo
 * cheio) pra não parecer alerta de erro — é uma pendência de
 * preenchimento, não um problema no sistema.
 */
function Pendente({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 border-l-2 border-mosaico-accent-deep/50 pl-4">
      <p className="font-sans text-xs font-semibold tracking-[0.14em] text-mosaico-accent-deep uppercase">
        Pendente de confirmação
      </p>
      <p className="mt-1 font-sans text-sm text-mosaico-ink-soft">{children}</p>
    </div>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-mosaico-border/15 pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-2xl text-mosaico-ink sm:text-[1.75rem]">
        {titulo}
      </h2>
      <div className="mt-4 space-y-4 font-sans text-base text-mosaico-ink-soft">
        {children}
      </div>
    </section>
  );
}

export default function PoliticaDePrivacidadePage() {
  return (
    <main>
      <section className="bg-mosaico-bg py-20 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
              Política de Privacidade
            </span>
            <h1 className="mt-5 font-serif text-4xl leading-[1.12] text-mosaico-ink sm:text-5xl">
              Como tratamos os seus dados
            </h1>
            <p className="mt-5 font-sans text-base text-mosaico-ink-soft">
              Este documento descreve, de forma direta, quais dados o
              Mosaico coleta, pra que usa cada um deles e com quem
              compartilha — reflete exatamente o que a plataforma faz
              hoje, sem promessas além disso.
            </p>
            <div className="mx-auto mt-8 max-w-xl rounded-[3px] border border-mosaico-border/30 bg-mosaico-surface/40 px-6 py-5 text-left">
              <p className="font-sans text-sm text-mosaico-ink-soft">
                <strong className="text-mosaico-ink">
                  Este documento ainda está em preparação.
                </strong>{" "}
                O conteúdo técnico reflete com precisão o funcionamento
                atual do Mosaico, mas algumas informações — identificação
                legal da empresa, canal oficial de contato e política de
                retenção de dados — ainda não foram confirmadas e estão
                sinalizadas abaixo. Esta página não deve ser considerada
                uma versão final, revisada juridicamente, até que essas
                pendências sejam resolvidas.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-mosaico-bg pb-24 lg:pb-32">
        <Container>
          <div className="mx-auto max-w-2xl space-y-10">
            <Secao titulo="1. Introdução e abrangência">
              <p>
                Esta política se aplica a todas as páginas do Mosaico e a
                qualquer pessoa que crie uma conta, navegue pelo catálogo
                ou compre acesso aos kits de templates. Ela descreve só o
                que o sistema efetivamente faz — não é uma lista de
                intenções nem de práticas de mercado genéricas.
              </p>
            </Secao>

            <Secao titulo="2. Identificação da controladora">
              <p>
                O Mosaico é operado pela pessoa ou empresa responsável
                pela plataforma, que atua como controladora dos dados
                pessoais tratados aqui.
              </p>
              <Pendente>
                Nome ou razão social da controladora, CNPJ (se aplicável)
                e endereço comercial, quando necessário informá-lo.
              </Pendente>
            </Secao>

            <Secao titulo="3. Dados pessoais tratados">
              <p>
                O Mosaico coleta só e-mail e senha, nos quatro formulários
                de autenticação da plataforma: criar conta, entrar,
                recuperar senha e definir nova senha. Nenhum outro dado
                pessoal é pedido em nenhum formulário — não há campo de
                nome, telefone, CPF, endereço ou data de nascimento em
                lugar nenhum do sistema.
              </p>
              <p>
                A senha nunca é armazenada pelo Mosaico em texto legível.
                Ela é gerenciada inteiramente pelo Supabase Auth, serviço
                de autenticação usado pela plataforma, que a mantém de
                forma protegida (com hash) — o Mosaico nunca tem acesso à
                senha em si, só à confirmação de que o login foi bem-
                sucedido.
              </p>
            </Secao>

            <Secao titulo="4. Finalidades do tratamento">
              <p>
                Os dados de e-mail e senha são usados exclusivamente para
                autenticar o usuário e controlar o acesso aos kits já
                adquiridos — identificar quem está logado e confirmar que
                a conta tem (ou não) um pagamento confirmado.
              </p>
            </Secao>

            <Secao titulo="5. Pagamentos e Mercado Pago">
              <p>
                A compra é feita por redirecionamento ao Checkout Pro do
                Mercado Pago — a pessoa digita os dados de pagamento
                (cartão, Pix etc.) diretamente numa página do Mercado
                Pago, nunca numa página do Mosaico. O Mosaico não recebe
                nem armazena número de cartão, código de segurança (CVV),
                nome do titular ou endereço de cobrança em nenhum momento
                desse processo.
              </p>
              <p>
                O que o Mosaico envia ao Mercado Pago, pra iniciar a
                compra, é só um identificador interno da conta (nunca o
                e-mail ou qualquer outro dado pessoal) — usado só pra
                vincular a confirmação do pagamento, feita pelo Mercado
                Pago, à conta certa.
              </p>
            </Secao>

            <Secao titulo="6. Armazenamento e Supabase">
              <p>
                O Mosaico usa o Supabase como provedor de autenticação,
                banco de dados e armazenamento de arquivos. Dois
                registros são mantidos por conta: um perfil (e-mail da
                conta e se o acesso completo está liberado) e um
                histórico de compra (identificador do pagamento no
                Mercado Pago, status, valor e datas) — nenhum dado de
                pagamento em si, conforme a seção anterior.
              </p>
            </Secao>

            <Secao titulo="7. Cookies e tecnologias semelhantes">
              <p>
                O Mosaico usa só um cookie técnico, de sessão, criado e
                gerenciado pelo Supabase — necessário pra manter a conta
                logada entre uma página e outra. Não há cookie de
                rastreamento, publicidade ou análise de comportamento no
                Mosaico hoje, nem ferramentas como Google Analytics ou
                Meta/Facebook Pixel.
              </p>
            </Secao>

            <Secao titulo="8. Compartilhamento com terceiros">
              <p>
                Os únicos serviços de terceiros envolvidos no
                funcionamento do Mosaico são o Supabase (autenticação,
                banco de dados e armazenamento de arquivos) e o Mercado
                Pago (processamento do pagamento). Nenhum dado é
                compartilhado com nenhum outro serviço, empresa ou
                finalidade além dessas duas.
              </p>
            </Secao>

            <Secao titulo="9. Segurança da informação">
              <p>
                O acesso aos dados de cada conta é restrito só à própria
                conta — uma pessoa nunca consegue ler dados de outra
                através do sistema. Os arquivos dos templates, depois de
                uma compra confirmada, são entregues por links de curta
                duração, gerados sob demanda, não por um endereço fixo e
                público. Nenhuma dessas medidas torna o sistema
                infalível — são as práticas atualmente em vigor, não uma
                garantia de segurança absoluta.
              </p>
            </Secao>

            <Secao titulo="10. Retenção e exclusão de dados">
              <Pendente>
                O Mosaico ainda não tem uma rotina de exclusão de conta ou
                um prazo definido de retenção de dados. Essa política
                será atualizada assim que essa definição existir.
              </Pendente>
            </Secao>

            <Secao titulo="11. Direitos dos titulares previstos na LGPD">
              <p>
                A Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
                garante a qualquer titular de dados pessoais o direito
                de, entre outros pontos: confirmar a existência de
                tratamento; acessar os dados tratados; corrigir dados
                incompletos, inexatos ou desatualizados; solicitar
                anonimização, bloqueio ou eliminação de dados
                desnecessários ou tratados em desconformidade com a lei;
                solicitar a portabilidade dos dados a outro fornecedor;
                ser informado sobre com quem os dados são compartilhados;
                e revogar o consentimento, quando aplicável.
              </p>
              <Pendente>
                O canal e o procedimento prático para exercer esses
                direitos ainda dependem do contato oficial do Mosaico
                (seção 13) — hoje não existe nenhum mecanismo
                automatizado no sistema para atender a esses pedidos.
              </Pendente>
            </Secao>

            <Secao titulo="12. Alterações desta política">
              <p>
                Esta política pode ser atualizada conforme o Mosaico
                muda ou conforme informações pendentes forem
                confirmadas. A versão mais recente estará sempre
                disponível nesta mesma página.
              </p>
            </Secao>

            <Secao titulo="13. Contato">
              <Pendente>
                Canal oficial de contato para dúvidas sobre esta política
                ou sobre dados pessoais — ainda não definido.
              </Pendente>
            </Secao>
          </div>
        </Container>
      </section>
    </main>
  );
}
