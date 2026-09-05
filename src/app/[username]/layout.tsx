import { Metadata } from 'next';

export async function generateMetadata({
    params
}: {
    params: Promise<{ username: string }>;
}): Promise<Metadata> {
    const resolvedParams = await params;
    const username = resolvedParams.username;

    return {
        title: `${username} // DevWrapped 2026`,
        description: `Check out ${username}'s GitHub activity and contributions!`,
        openGraph: {
            title: `${username}'s Github Wrapped`,
            description: `Check out ${username}'s contribution streak, top languages, and more on DevWrapped 2026!`,
            images: [
                {
                    url: `/${username}/og`,
                    width: 1200,
                    height: 630,
                    alt: `${username}'s DevWrapped Card`,
                }
            ]
        },
        twitter: {
            card: 'summary_large_image',
            title: `${username} // DevWrapped 2026`,
            images: [`/${username}/og`],
        }
    };
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
        </>
    )
}