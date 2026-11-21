import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "Condições de uso da plataforma Mosaico, da licença dos templates e do acesso aos kits adquiridos.",
};

/**
 * Mesmo componente de selo de pendência já usado na Política de
 * Privacidade (Fase 4.50B) — reaproveitado aqui de propósito, não
 * recriado, pra manter um único padrão visual de "isto ainda não está
 * definitivo" em todo o site.
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

export default function TermosDeUsoPage() {
  return (
    <main>
      <section className="bg-mosaico-bg py-20 lg:py-24">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-sans text-xs font-semibold tracking-[0.2em] text-mosaico-accent-deep uppercase">
              Termos de Uso
            </span>
            <h1 className="mt-5 font-serif text-4xl leading-[1.12] text-mosaico-ink sm:text-5xl">
              As regras de uso do Mosaico
            </h1>
            <p className="mt-5 font-sans text-base text-mosaico-ink-soft">
              Este documento descreve como funciona a compra, o acesso e
              a licença de uso dos templates do Mosaico — em linguagem
              direta, sem prometer nada além do que a plataforma
              efetivamente oferece.
            </p>
            <div className="mx-auto mt-8 max-w-xl rounded-[3px] border border-mosaico-border/30 bg-mosaico-surface/40 px-6 py-5 text-left">
              <p className="font-sans text-sm text-mosaico-ink-soft">
                <strong className="text-mosaico-ink">
                  Este documento ainda está em preparação.
                </strong>{" "}
                As regras comerciais já aprovadas estão refletidas com
                precisão, mas algumas informações — identificação legal
                da empresa, canal oficial de contato, validação jurídica
                das cláusulas de reembolso e responsabilidade, e a
                conclusão da auditoria de licenciamento dos elementos do
                Canva — ainda estão pendentes e sinalizadas abaixo. Esta
                página não deve ser considerada uma versão final, pronta
                para publicação definitiva.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-mosaico-bg pb-24 lg:pb-32">
        <Container>
          <div className="mx-auto max-w-2xl space-y-10">
            <Secao titulo="1. Apresentação e aceitação dos termos">
              <p>
                Ao criar uma conta, navegar pelo catálogo ou comprar
                acesso a um kit, você concorda com as condições descritas
                neste documento. Se não concordar com algum ponto, a
                recomendação é não prosseguir com o cadastro ou a compra.
              </p>
            </Secao>

            <Secao titulo="2. O que é o Mosaico">
              <p>
                O Mosaico é uma plataforma que reúne kits de templates
                editáveis no Canva, organizados por profissão. A compra
                dá acesso aos kits disponíveis, que são editados
                diretamente na conta Canva de cada comprador.
              </p>
            </Secao>

            <Secao titulo="3. Cadastro e responsabilidades da conta">
              <p>
                O cadastro exige e-mail e senha. Você é responsável por
                manter o acesso à sua conta seguro e por qualquer
                atividade realizada a partir dela. A conta é pessoal e
                vinculada a quem efetivamente realizou a compra.
              </p>
            </Secao>

            <Secao titulo="4. Compra e pagamento">
              <p>
                A compra é feita por pagamento único, processado pelo
                Mercado Pago. O Mosaico nunca recebe nem armazena dados
                de cartão — o pagamento acontece inteiramente numa página
                do próprio Mercado Pago. O acesso é liberado depois da
                confirmação do pagamento.
              </p>
            </Secao>

            <Secao titulo="5. Kits futuros">
              <p>
                O pagamento único garante acesso permanente aos kits
                disponíveis no Mosaico no momento da confirmação da
                compra. Kits lançados posteriormente não estão
                automaticamente incluídos nesse acesso — qualquer
                inclusão de kits futuros, caso venha a ocorrer, será uma
                decisão comercial à parte, comunicada antes de qualquer
                cobrança adicional.
              </p>
            </Secao>

            <Secao titulo="6. Acesso permanente e disponibilidade">
              <p>
                O acesso aos kits adquiridos é permanente — não expira e
                não depende de mensalidade ou qualquer cobrança
                recorrente. Isso é diferente da disponibilidade técnica
                da plataforma: o Mosaico pode passar por manutenções,
                instabilidades ou interrupções temporárias, sem que isso
                signifique perda do seu direito de acesso assim que o
                serviço for restabelecido. O acesso pode ser suspenso em
                casos de fraude comprovada, uso em desacordo com estes
                Termos, determinação legal ou a seu próprio pedido.
              </p>
            </Secao>

            <Secao titulo="7. Edição dos templates no Canva">
              <p>
                Cada template abre como uma cópia independente sua
                dentro do Canva — nunca uma edição compartilhada do
                arquivo original. Você troca texto, foto e cor sem
                afetar o modelo original nem o de qualquer outro
                comprador.
              </p>
            </Secao>

            <Secao titulo="8. Licença de uso">
              <p>A compra permite:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Uso pessoal dos templates.</li>
                <li>Uso profissional e comercial dos templates.</li>
                <li>
                  Edição dos templates no Canva, diretamente pelo
                  comprador.
                </li>
                <li>
                  Criação de materiais finais para os próprios clientes
                  do comprador, inclusive em serviços de social media,
                  design, publicidade, agências e outras atividades
                  profissionais.
                </li>
                <li>Entrega das artes finais produzidas aos clientes.</li>
              </ul>
              <p>A compra não permite:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Compartilhar o link de edição recebido com terceiros.</li>
                <li>Transferir ou entregar os arquivos editáveis.</li>
                <li>Revender os templates originais.</li>
                <li>
                  Revender versões modificadas dos templates como produto
                  digital.
                </li>
                <li>Redistribuir os arquivos, de qualquer forma.</li>
                <li>Sublicenciar ou transferir esta licença a terceiros.</li>
              </ul>
              <p>
                Em resumo: você pode vender o seu serviço e entregar o
                resultado final do seu trabalho — não pode revender ou
                transferir o template editável em si.
              </p>
            </Secao>

            <Secao titulo="9. Licença para equipes">
              <p>
                A licença é individual, vinculada à conta que realizou a
                compra. Com ela, você pode atender quantos clientes
                quiser e entregar os materiais finais produzidos — isso
                não exige licença adicional.
              </p>
              <p>
                O que a licença não cobre é o acesso de edição em si:
                cada funcionário, colaborador ou qualquer outra pessoa
                que precise abrir e editar os templates diretamente (não
                apenas receber o resultado pronto) precisa da própria
                conta e da própria compra. Por exemplo: se três pessoas
                de uma equipe forem editar os templates diretamente, são
                necessárias três compras — entregar artes finais prontas
                a um cliente é diferente de compartilhar o arquivo
                editável com várias pessoas.
              </p>
            </Secao>

            <Secao titulo="10. Restrições de utilização">
              <p>
                Além do que já está descrito na licença de uso (seção
                8), não é permitido usar os templates ou o Mosaico de
                forma a infringir direitos de terceiros, disponibilizar
                os arquivos originais ou modificados gratuitamente, nem
                usar a plataforma para qualquer finalidade ilegal.
              </p>
            </Secao>

            <Secao titulo="11. Propriedade intelectual e elementos do Canva">
              <p>
                O Mosaico detém os direitos sobre a curadoria e a
                organização dos kits por profissão. Os templates são
                construídos na ferramenta do Canva, usando a biblioteca
                de elementos da própria plataforma (elementos gratuitos,
                elementos Pro e, eventualmente, elementos próprios ou
                externos) — o uso desses elementos individuais segue os
                termos do Canva, não os do Mosaico.
              </p>
              <Pendente>
                A verificação individual de licenciamento dos elementos
                usados em cada um dos 323 templates do catálogo ainda
                não foi concluída. Até essa verificação terminar, o
                Mosaico não garante que todo elemento de todo template
                está liberado para qualquer finalidade comercial — alguns
                podem estar sujeitos a termos específicos do Canva.
              </Pendente>
            </Secao>

            <Secao titulo="12. Licença estendida">
              <p>
                O Mosaico não oferece, neste momento, uma licença
                estendida para revenda ou redistribuição dos templates.
                Isso não limita o uso profissional já previsto na seção
                8: produzir e entregar materiais finais para seus
                clientes continua permitido. O que fica de fora é a
                comercialização do template em si — o arquivo editável,
                original ou modificado — como um produto à parte.
              </p>
            </Secao>

            <Secao titulo="13. Reembolso e direito de arrependimento">
              <p>
                Nos termos do artigo 49 do Código de Defesa do
                Consumidor, toda compra feita fora de estabelecimento
                comercial — o que inclui compras pela internet — dá à
                pessoa consumidora o direito de desistir em até 7 (sete)
                dias corridos, contados da confirmação da compra ou do
                recebimento do produto, com devolução integral do valor
                pago.
              </p>
              <Pendente>
                Como esse direito se aplica especificamente quando o
                produto digital já foi acessado, baixado ou editado
                dentro desse prazo ainda depende de validação jurídica —
                não presumimos essa resposta aqui. Além do direito legal
                acima, o Mosaico ainda não tem uma política comercial
                adicional de reembolso definida.
              </Pendente>
            </Secao>

            <Secao titulo="14. Responsabilidades, limitações e encerramento de contas">
              <p>
                O Mosaico se compromete a manter a plataforma e o acesso
                aos kits adquiridos, dentro das condições já descritas
                nas seções 5 e 6. O uso da plataforma em desacordo com
                estes Termos pode levar à suspensão ou ao encerramento da
                conta.
              </p>
              <Pendente>
                O texto final de limitação de responsabilidade do
                Mosaico ainda depende de validação jurídica.
              </Pendente>
            </Secao>

            <Secao titulo="15. Alterações dos termos e contato">
              <p>
                Estes Termos podem ser atualizados conforme o Mosaico
                muda ou conforme as pendências listados neste documento
                forem resolvidas. A versão mais recente estará sempre
                disponível nesta mesma página.
              </p>
              <Pendente>
                Canal oficial de contato para dúvidas sobre estes Termos
                — ainda não definido.
              </Pendente>
            </Secao>
          </div>
        </Container>
      </section>
    </main>
  );
}
